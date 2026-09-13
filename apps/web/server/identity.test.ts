import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { createTestDb } from '@/server/test/db';
import { resolveUser } from './identity';

/**
 * Identity resolution. No real Cloudflare Access is reachable from tests —
 * a throwaway RSA keypair stands in for Access's signing key, and
 * `global.fetch` is stubbed to serve it as the JWKS response
 * `getAccessCerts` fetches. This exercises the exact verification path
 * (RS256, aud/iss/exp checks) production runs, just against test keys.
 */

const TEAM_DOMAIN = 'test-team.cloudflareaccess.com';
const APP_AUD = 'test-aud-1234';
const ENV = { ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_APP_AUD: APP_AUD };
const DEV_ENV = { ACCESS_TEAM_DOMAIN: undefined, ACCESS_APP_AUD: undefined };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  ) as Promise<CryptoKeyPair>;
}

async function jwkOf(publicKey: CryptoKey, kid: string) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return { kid, kty: jwk.kty!, n: jwk.n!, e: jwk.e! };
}

async function signJwt(privateKey: CryptoKey, kid: string, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const headerB64 = b64urlJson(header);
  const payloadB64 = b64urlJson(payload);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signingInput);
  return `${headerB64}.${payloadB64}.${b64url(sig)}`;
}

function headersWith(jwt: string | null): Headers {
  const h = new Headers();
  if (jwt) h.set('Cf-Access-Jwt-Assertion', jwt);
  return h;
}

const KID = 'test-kid-1';
let keyPair: CryptoKeyPair;
let otherKeyPair: CryptoKeyPair;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    aud: APP_AUD,
    iss: `https://${TEAM_DOMAIN}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'applicant@example.com',
    ...overrides,
  };
}

// Generated once for the whole file (not per-test): identity.ts caches the
// fetched JWKS per isolate for an hour (matching Access's own real rotation
// cadence) — a fresh keypair every test would fight that cache exactly the
// way a real key rotation would, which isn't what these tests are about.
beforeAll(async () => {
  keyPair = await generateKeyPair();
  otherKeyPair = await generateKeyPair();
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
        return {
          ok: true,
          json: async () => ({ keys: [await jwkOf(keyPair.publicKey, KID)] }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveUser — dev-mode escape hatch', () => {
  it('falls back to user 1 with no email when Access secrets are absent (local next dev)', async () => {
    const { db } = createTestDb();
    const result = await resolveUser(headersWith(null), db, DEV_ENV);
    expect(result).toEqual({ userId: DEFAULT_USER_ID, email: null });
  });
});

describe('resolveUser — fail-closed JWT verification', () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb().db;
  });

  it('rejects a missing JWT header', async () => {
    expect(await resolveUser(headersWith(null), db, ENV)).toEqual({ error: 'unauthorized' });
  });

  it('rejects a bad signature (signed by a different key than the published JWKS)', async () => {
    const jwt = await signJwt(otherKeyPair.privateKey, KID, validPayload());
    expect(await resolveUser(headersWith(jwt), db, ENV)).toEqual({ error: 'unauthorized' });
  });

  it('rejects an unknown kid', async () => {
    const jwt = await signJwt(keyPair.privateKey, 'not-the-published-kid', validPayload());
    expect(await resolveUser(headersWith(jwt), db, ENV)).toEqual({ error: 'unauthorized' });
  });

  it('rejects the wrong audience', async () => {
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ aud: 'some-other-app' }));
    expect(await resolveUser(headersWith(jwt), db, ENV)).toEqual({ error: 'unauthorized' });
  });

  it('rejects the wrong issuer', async () => {
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ iss: 'https://not-the-team.cloudflareaccess.com' }));
    expect(await resolveUser(headersWith(jwt), db, ENV)).toEqual({ error: 'unauthorized' });
  });

  it('rejects an expired token', async () => {
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ exp: Math.floor(Date.now() / 1000) - 60 }));
    expect(await resolveUser(headersWith(jwt), db, ENV)).toEqual({ error: 'unauthorized' });
  });

  it('rejects a malformed token', async () => {
    expect(await resolveUser(headersWith('not.a.jwt.at.all'), db, ENV)).toEqual({ error: 'unauthorized' });
  });
});

describe('resolveUser — service tokens (non_identity)', () => {
  it('maps a verified JWT with no email claim to user 1', async () => {
    const { db } = createTestDb();
    const jwt = await signJwt(keyPair.privateKey, KID, {
      aud: APP_AUD,
      iss: `https://${TEAM_DOMAIN}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      common_name: 'ops-service-token',
      // deliberately no `email`
    });
    expect(await resolveUser(headersWith(jwt), db, ENV)).toEqual({ userId: DEFAULT_USER_ID, email: null });
  });
});

describe('resolveUser — create-on-first-visit (empty user)', () => {
  it('creates a new, otherwise-empty user row on first visit', async () => {
    const { db } = createTestDb();
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ email: 'new.person@example.com' }));

    const result = await resolveUser(headersWith(jwt), db, ENV);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.email).toBe('new.person@example.com');

    const row = await db.query.users.findFirst({ where: eq(schema.users.id, result.userId) });
    expect(row).toBeTruthy();
    expect(row!.name).toBe('new.person');
    expect(row!.email).toBe('new.person@example.com');
    expect(row!.reviewEmail).toBeNull();

    const profiles = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, result.userId));
    expect(profiles).toHaveLength(0); // no seed for a new user
  });

  it('normalises the email to lowercase before lookup/insert', async () => {
    const { db } = createTestDb();
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ email: 'Mixed.Case@Example.com' }));

    const result = await resolveUser(headersWith(jwt), db, ENV);
    if ('error' in result) throw new Error('expected success');
    expect(result.email).toBe('mixed.case@example.com');

    const row = await db.query.users.findFirst({ where: eq(schema.users.email, 'mixed.case@example.com') });
    expect(row).toBeTruthy();
  });

  it('reuses the same user row on a second visit — no duplicate created', async () => {
    const { db } = createTestDb();
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ email: 'repeat@example.com' }));

    const first = await resolveUser(headersWith(jwt), db, ENV);
    const second = await resolveUser(headersWith(jwt), db, ENV);
    if ('error' in first || 'error' in second) throw new Error('expected success');
    expect(second.userId).toBe(first.userId);

    const rows = await db.select().from(schema.users).where(eq(schema.users.email, 'repeat@example.com'));
    expect(rows).toHaveLength(1);
  });

  it('is race-safe: two concurrent first-visits from the same email create exactly one row', async () => {
    const { db } = createTestDb();
    const jwt = await signJwt(keyPair.privateKey, KID, validPayload({ email: 'concurrent@example.com' }));

    const [a, b] = await Promise.all([resolveUser(headersWith(jwt), db, ENV), resolveUser(headersWith(jwt), db, ENV)]);
    if ('error' in a || 'error' in b) throw new Error('expected success');
    expect(a.userId).toBe(b.userId);

    const rows = await db.select().from(schema.users).where(eq(schema.users.email, 'concurrent@example.com'));
    expect(rows).toHaveLength(1);
  });
});
