import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getRun } from '@/server/runs';

/** GET /api/runs/[id] — one run, only if it belongs to the caller (a foreign id reads as 404, never 403). */
export const runtime = 'nodejs';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return Response.json({ error: 'bad id' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const run = await getRun(db, runId);
  if (!run || run.userId !== identity.userId) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ run });
}
