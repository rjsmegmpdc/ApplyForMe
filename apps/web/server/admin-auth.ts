/**
 * Bearer-token check shared by the /api/admin/* routes: the Worker secret
 * ADMIN_TOKEN, compared in constant time. 'unconfigured' when the secret is
 * unset (routes answer 503, so they are inert by default).
 */
export type AdminAuth = 'ok' | 'unauthorized' | 'unconfigured';

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function isAdminRequest(request: Request, env: { ADMIN_TOKEN?: string }): AdminAuth {
  if (!env.ADMIN_TOKEN) return 'unconfigured';
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token && timingSafeEqual(token, env.ADMIN_TOKEN) ? 'ok' : 'unauthorized';
}
