import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getRun } from '@/server/runs';
import { buildPipelineDeps } from '@/server/pipeline/inbound-handler';
import { resendRun } from '@/server/pipeline/run-job';

/**
 * POST /api/runs/[id]/resend — the run page's "Resend email" button: the
 * stored pack again, fresh action links, no model call. Session (Access).
 */
export const runtime = 'nodejs';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return Response.json({ error: 'bad id' }, { status: 400 });

  const db = getDb();
  const env = getEnv();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const run = await getRun(db, runId);
  if (!run || run.userId !== identity.userId) return Response.json({ error: 'not found' }, { status: 404 });

  const result = await resendRun(buildPipelineDeps(env), runId);
  return Response.json(result, { status: result.status === 'sent' ? 200 : 409 });
}
