import { headers } from 'next/headers';
import { getDb, getEnv } from '@/server/db';
import { resolveUser, type ResolvedIdentity } from '@/server/identity';

/**
 * Identity for server components. Returns null when Access rejects the
 * request (pages render a "session expired" notice — there is no login UI,
 * Cloudflare Access owns the session). API routes call resolveUser directly
 * with `request.headers` and answer 401 instead.
 */
export async function pageIdentity(): Promise<ResolvedIdentity | null> {
  const identity = await resolveUser(await headers(), getDb(), getEnv());
  return 'error' in identity ? null : identity;
}
