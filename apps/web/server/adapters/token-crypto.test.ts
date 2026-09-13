import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from './token-crypto';

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

describe('token crypto', () => {
  it('round-trips a secret', async () => {
    const stored = await encryptToken('sk-ant-abc123', KEY);
    expect(stored).not.toContain('sk-ant-abc123');
    expect(await decryptToken(stored, KEY)).toBe('sk-ant-abc123');
  });

  it('produces distinct ciphertext per call (fresh IV)', async () => {
    const a = await encryptToken('same-secret', KEY);
    const b = await encryptToken('same-secret', KEY);
    expect(a).not.toBe(b);
  });

  it('rejects a wrong-size key', async () => {
    const shortKey = Buffer.from(new Uint8Array(16).fill(1)).toString('base64');
    await expect(encryptToken('x', shortKey)).rejects.toThrow('32 bytes');
  });

  it('fails to decrypt with a different key', async () => {
    const otherKey = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
    const stored = await encryptToken('secret', KEY);
    await expect(decryptToken(stored, otherKey)).rejects.toThrow();
  });
});

describe('token crypto — versioned envelope (read old + new, write new only)', () => {
  it('encryptToken writes the versioned JSON envelope, not the legacy bare format', async () => {
    const stored = await encryptToken('sk-ant-abc123', KEY);
    const parsed = JSON.parse(stored) as { v: number; iv: string; ct: string };
    expect(parsed.v).toBe(1);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ct).toBe('string');
    expect(await decryptToken(stored, KEY)).toBe('sk-ant-abc123');
  });

  it('decryptToken still reads a legacy iv:cipher value', async () => {
    // Hand-construct a legacy-format ciphertext to prove the read path
    // independently of encryptToken.
    const key = await crypto.subtle.importKey('raw', Buffer.from(KEY, 'base64'), { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('legacy-token'));
    const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    const legacyStored = `${toB64(iv)}:${toB64(new Uint8Array(cipher))}`;

    expect(await decryptToken(legacyStored, KEY)).toBe('legacy-token');
  });

  it('rejects a malformed stored value', async () => {
    await expect(decryptToken('not-an-envelope', KEY)).rejects.toThrow('malformed');
  });
});
