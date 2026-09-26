import { z } from 'zod';
import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { buildPipelineDeps } from '@/server/pipeline/inbound-handler';
import { isHttpUrl, runJobUrl } from '@/server/pipeline/run-url';

/**
 * POST /api/runs/url — run a pasted job URL through the pipeline for the
 * signed-in user. Synchronous: returns when the run is sent, skipped or
 * failed (tailoring takes ~30–90 s). `text` is optional pasted ad text for
 * pages the Worker cannot fetch.
 */
export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().trim().min(8).max(2000),
  text: z.string().max(60_000).optional().nullable(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isHttpUrl(parsed.data.url)) {
    return Response.json({ error: 'url (http/https) required; text optional' }, { status: 400 });
  }
  const db = getDb();
  const env = getEnv();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const result = await runJobUrl(buildPipelineDeps(env), { userId: identity.userId, url: parsed.data.url, text: parsed.data.text ?? null });
  return Response.json(result);
}
