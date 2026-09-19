import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';

/**
 * Identity resolution — maps the caller's Cloudflare Access identity to a
 * `users` row. Verifies the `Cf-Access-Jwt-Assertion` header (RS256 against
 * the team's JWKS, aud/iss/exp checks) the same way AICoach's
 * server/identity.ts does (ported, not imported — the two Workers don't
 * share a package).
 *
 * Dev-mode escape hatch: `ACCESS_TEAM_DOMAIN`/`ACCESS_APP_AUD` are Worker
 * SECRETS, not `vars` (see wrangler.jsonc/cloudflare-env.d.ts) — deliberately
 * so `initOpenNextCloudflareForDev()` (which mirrors wrangler.jsonc `vars`
 * into local `next dev`) never sees them unless a developer explicitly adds
 * them to `.dev.vars`. Absent, local `next dev` falls back to user 1 with no
 * email — this is a LOCAL-ONLY behaviour; the fallback never fires in the
 * deployed Worker once both secrets are set at deploy.
 *
 * Fail-closed: any other missing/invalid JWT (wrong signature, wrong aud,
 * wrong iss, expired, malformed) resolves to `{error: 'unauthorized'}` —
 * callers must treat that as a hard 401 (routes) or a redirect to a
 * "session expired" state (pages), never a silent user-1 fallback.
 */

export interface ResolvedIdentity {
  userId: number;
  /** Null for the dev-mode fallback and for service-token (non_identity) requests — neither carries a real user email. */
  email: string | null;
}

export type ResolveUserResult = ResolvedIdentity | { error: 'unauthorized' };

interface AccessJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface AccessJwtPayload {
  aud?: string | string[];
  exp?: number;
  iss?: string;
  email?: string;
}

// JWKS cached per isolate, keyed by team domain — Access rotates keys rarely.
let certsCache: { teamDomain: string; keys: AccessJwk[]; fetchedAt: number } | null = null;
const CERTS_TTL_MS = 60 * 60 * 1000;

async function getAccessCerts(teamDomain: string): Promise<AccessJwk[]> {
  if (certsCache && certsCache.teamDomain === teamDomain && Date.now() - certsCache.fetchedAt < CERTS_TTL_MS) {
    return certsCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed (${res.status})`);
  const data = (await res.json()) as { keys: AccessJwk[] };
  certsCache = { teamDomain, keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T;
}

/** Verifies an Access JWT and returns its payload. Throws on any failure — callers treat any throw as unauthorized. */
async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<AccessJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = b64urlToJson<{ kid?: string; alg?: string }>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected JWT header');

  const keys = await getAccessCerts(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlToBytes(sigB64) as BufferSource,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) throw new Error('bad signature');

  const payload = b64urlToJson<AccessJwtPayload>(payloadB64);
  const audList = Array.isArray(payload.aud) ? payload.aud : payload.aud != null ? [payload.aud] : [];
  if (!audList.includes(aud)) throw new Error('aud mismatch');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('expired');
  if (payload.iss !== `https://${teamDomain}`) throw new Error('iss mismatch');
  return payload;
}

/**
 * Find the user row for a verified email, creating an empty one on first
 * visit. Race-safe: the unique index on `users.email` plus
 * `onConflictDoNothing` means two concurrent first-visits from the same
 * person can both attempt the insert, but only one row is ever created —
 * the re-select after the insert always finds it, whichever call won.
 *
 * A brand-new row gets ONLY name (the email's local-part) + email — no
 * profile, no trigger rules, no preferences. The review pack goes to the
 * identity email until the user sets `review_email` in the UI.
 */
async function findOrCreateUserByEmail(db: Db, email: string): Promise<number> {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) return existing.id;

  const name = email.split('@')[0] || email;

  // Single-user bootstrap: the pipeline writes everything against DEFAULT_USER_ID
  // (seeded by migration 0001 with no email). The first identity to log in claims
  // that row, so the profile/rules they set in the UI are the ones the pipeline
  // uses. Later identities get their own rows as before.
  const defaultRow = await db.query.users.findFirst({ where: eq(schema.users.id, DEFAULT_USER_ID) });
  if (defaultRow && defaultRow.email == null) {
    await db.update(schema.users).set({ email, name }).where(eq(schema.users.id, DEFAULT_USER_ID));
    const claimed = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (claimed) return claimed.id;
  }

  await db.insert(schema.users).values({ name, email }).onConflictDoNothing({ target: schema.users.email });

  const row = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!row) throw new Error('user creation failed unexpectedly');
  return row.id;
}

/**
 * Resolve the calling user from the request's Access identity.
 *
 * - Dev mode (no ACCESS_TEAM_DOMAIN/ACCESS_APP_AUD secret configured): user 1, no email.
 * - No JWT header, or verification fails for any reason: `{error: 'unauthorized'}`.
 * - Verified JWT with no `email` claim (Cloudflare Access service tokens carry
 *   `common_name`, not `email`): user 1, no email — ops/build-proxy context.
 * - Verified JWT with an `email` claim: find-or-create the user by that
 *   email (lowercased — Access emails are case-insensitive identities).
 */
export async function resolveUser(
  headers: Pick<Headers, 'get'>,
  db: Db,
  env: Pick<CloudflareEnv, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_APP_AUD'>
): Promise<ResolveUserResult> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_APP_AUD) {
    return { userId: DEFAULT_USER_ID, email: null };
  }

  const jwt = headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return { error: 'unauthorized' };

  let payload: AccessJwtPayload;
  try {
    payload = await verifyAccessJwt(jwt, env.ACCESS_TEAM_DOMAIN, env.ACCESS_APP_AUD);
  } catch {
    return { error: 'unauthorized' };
  }

  if (!payload.email) {
    return { userId: DEFAULT_USER_ID, email: null };
  }

  const email = payload.email.toLowerCase();
  const userId = await findOrCreateUserByEmail(db, email);
  return { userId, email };
}
