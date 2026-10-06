/**
 * The Worker answers on two hostnames: the custom domain (APP_BASE_URL,
 * app.applyforme.dev) which Cloudflare Access protects, and the default
 * *.workers.dev address, which Access does not cover. A browser on the
 * workers.dev address never carries an Access token, so every page there
 * fails closed with "Access did not accept this request" — and reloading
 * cannot fix it. So browser requests on workers.dev are redirected to the
 * same path on the app domain, where Access signs the user in.
 *
 * Not redirected: /api/admin/* (bearer-token operator routes, used from
 * places that cannot reach the custom domain) and anything that is not a
 * GET/HEAD (a redirect would turn a POST into a GET).
 */
export function workersDevRedirect(request: Request, appBaseUrl: string | undefined): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  let app: URL;
  try {
    app = new URL(appBaseUrl ?? '');
  } catch {
    return null;
  }
  const url = new URL(request.url);
  if (!url.hostname.endsWith('.workers.dev') || url.hostname === app.hostname) return null;
  if (url.pathname.startsWith('/api/admin/')) return null;
  const target = new URL(url.pathname + url.search, app.origin);
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
}
