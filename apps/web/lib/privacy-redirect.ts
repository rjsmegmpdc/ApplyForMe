/**
 * Where a client should go after an API response, if anywhere. A tab or installed app left open
 * across a privacy-statement update gets 403 {privacy: true} from every API; without this it
 * would quietly show empty screens instead of the accept page.
 */
export function privacyRedirectTarget(status: number, body: unknown, pathname: string): string | null {
  if (status !== 403 || !body || typeof body !== 'object' || (body as { privacy?: unknown }).privacy !== true) return null;
  if (pathname.startsWith('/privacy')) return null; // already there: never loop
  return '/privacy/accept';
}
