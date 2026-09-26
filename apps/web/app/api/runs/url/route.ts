import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { buildPipelineDeps } from '@/server/pipeline/inbound-handler';
import { parseRunUrlBody, runJobUrl } from '@/server/pipeline/run-url';

/**
 * POST /api/runs/url — run a pasted job URL through the pipeline for the
 * signed-in user. Synchronous: returns when the run is sent, skipped or
 * failed (tailoring takes ~30–90 s). `text` is optional pasted ad text for
 * pages the Worker cannot fetch; title/company/location/salary are optional
 * overrides for what the page or text would otherwise supply.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const input = parseRunUrlBody(await request.json().catch(() => null));
  if (!input) return Response.json({ error: 'url (http/https) required; text/title/company/location/salary optional' }, { status: 400 });
  const db = getDb();
  const env = getEnv();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const result = await runJobUrl(buildPipelineDeps(env), { userId: identity.userId, ...input });
  return Response.json(result);
}
