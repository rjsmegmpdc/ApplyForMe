import { getEnv } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { isAdminRequest } from '@/server/admin-auth';
import { buildPipelineDeps } from '@/server/pipeline/inbound-handler';
import { parseRunUrlBody, runJobUrl } from '@/server/pipeline/run-url';

/**
 * POST /api/admin/run-url — same as /api/runs/url but authenticated with a
 * bearer token (Worker secret ADMIN_TOKEN) instead of an Access identity, so
 * an operator without a browser session (e.g. a CLI or Claude Code) can push
 * a job through for the default user. 503 when no token is configured, so
 * the route is inert by default.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const auth = isAdminRequest(request, env);
  if (auth === 'unconfigured') return Response.json({ error: 'admin token not configured' }, { status: 503 });
  if (auth === 'unauthorized') return Response.json({ error: 'unauthorized' }, { status: 401 });

  const input = parseRunUrlBody(await request.json().catch(() => null));
  if (!input) return Response.json({ error: 'url (http/https) required; text/title/company/location/salary optional' }, { status: 400 });
  const result = await runJobUrl(buildPipelineDeps(env), { userId: DEFAULT_USER_ID, ...input });
  return Response.json(result);
}
