import { z } from 'zod';
import { getEnv } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { buildPipelineDeps } from '@/server/pipeline/inbound-handler';
import { isHttpUrl, runJobUrl } from '@/server/pipeline/run-url';

/**
 * POST /api/admin/run-url — same as /api/runs/url but authenticated with a
 * bearer token (Worker secret ADMIN_TOKEN) instead of an Access identity, so
 * an operator without a browser session (e.g. a CLI or Claude Code) can push
 * a job through for the default user. 503 when no token is configured, so
 * the route is inert by default. Constant-time comparison.
 */
export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().trim().min(8).max(2000),
  text: z.string().max(60_000).optional().nullable(),
});

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!env.ADMIN_TOKEN) return Response.json({ error: 'admin token not configured' }, { status: 503 });
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !timingSafeEqual(token, env.ADMIN_TOKEN)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isHttpUrl(parsed.data.url)) {
    return Response.json({ error: 'url (http/https) required; text optional' }, { status: 400 });
  }
  const result = await runJobUrl(buildPipelineDeps(env), { userId: DEFAULT_USER_ID, url: parsed.data.url, text: parsed.data.text ?? null });
  return Response.json(result);
}
