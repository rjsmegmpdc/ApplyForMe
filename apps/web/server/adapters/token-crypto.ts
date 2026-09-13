/**
 * AES-GCM encryption for credentials at rest in D1 (the per-user Anthropic
 * key today). WebCrypto only — identical behaviour in workerd and Node ≥20.
 *
 * Key: TOKENS_ENC_KEY Worker secret, base64-encoded 32 bytes
 * (generate: openssl rand -base64 32). Plaintext secrets exist only
 * transiently in Worker memory — never persisted, never logged, never sent
 * to the client.
 *
 * Ciphertext envelope: every write uses a versioned JSON envelope
 * `{v:1,iv,ct}` (ported from AICoach's token-crypto.ts) so the format can be
 * rotated later without a flag day. decryptToken also accepts the legacy
 * bare `base64(iv):base64(cipher)` string that AICoach's first rows used —
 * ApplyForMe never writes that shape, but keeping the read path costs
 * nothing and keeps the two adapters byte-for-byte comparable.
 */

function b64encode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64decode(keyB64);
  if (raw.length !== 32) throw new Error('TOKENS_ENC_KEY must be base64 of exactly 32 bytes');
  // @types/node's global Uint8Array is generic over ArrayBufferLike (to cover
  // Buffer), which DOM's stricter BufferSource (ArrayBuffer only) rejects —
  // a typing-only mismatch, the runtime bytes are identical either way.
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const ENVELOPE_VERSION = 1 as const;

interface EncryptedEnvelope {
  v: typeof ENVELOPE_VERSION;
  iv: string;
  ct: string;
}

function parseEnvelope(stored: string): EncryptedEnvelope | null {
  // Legacy format is `base64:base64` with exactly one colon and no braces —
  // cheap enough to skip JSON.parse for that case, but parsing is also
  // harmless there since it'll just throw/fail the shape check below.
  if (!stored.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<EncryptedEnvelope>;
    if (parsed.v === ENVELOPE_VERSION && typeof parsed.iv === 'string' && typeof parsed.ct === 'string') {
      return parsed as EncryptedEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

export async function encryptToken(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const envelope: EncryptedEnvelope = { v: ENVELOPE_VERSION, iv: b64encode(iv), ct: b64encode(new Uint8Array(cipher)) };
  return JSON.stringify(envelope);
}

/**
 * Decrypts either format: the versioned envelope written by every
 * encryptToken call, or the legacy bare `iv:cipher` string. Rows are never
 * rewritten by this function — a legacy row only upgrades the next time
 * something calls encryptToken on the same value (credential re-save).
 */
export async function decryptToken(stored: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const envelope = parseEnvelope(stored);

  let ivB64: string;
  let cipherB64: string;
  if (envelope) {
    ivB64 = envelope.iv;
    cipherB64 = envelope.ct;
  } else {
    [ivB64, cipherB64] = stored.split(':');
    if (!ivB64 || !cipherB64) throw new Error('malformed token ciphertext');
  }

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(cipherB64) as BufferSource
  );
  return new TextDecoder().decode(plain);
}
