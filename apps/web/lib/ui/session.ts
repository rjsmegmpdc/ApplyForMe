import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, getEnv } from '@/server/db';
import { resolveUser, type ResolvedIdentity } from '@/server/identity';

/**
 * Identity for server components. Returns null when Access rejects the
 * request (pages render a "session expired" notice — there is no login UI,
 * Cloudflare Access owns the session). A user who has not accepted the
 * current privacy statement is redirected to /privacy/accept: no page
 * renders anything for them first (server/identity.ts privacy gate). API
 * routes call resolveUser directly with `request.headers` and answer with
 * identityErrorResponse (401, or 403 {privacy: true}).
 */
export async function pageIdentity(): Promise<ResolvedIdentity | null> {
  const identity = await resolveUser(await headers(), getDb(), getEnv());
  if ('error' in identity) {
    if (identity.error === 'privacy') redirect('/privacy/accept');
    return null;
  }
  return identity;
}
