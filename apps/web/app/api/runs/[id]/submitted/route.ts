import { z } from 'zod';
import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getRun, setRunSubmitted } from '@/server/runs';

/**
 * POST /api/runs/[id]/submitted — { submitted: boolean }: the Runs table's
 * "Submitted" checkbox. Session-authenticated through Access.
 */
export const runtime = 'nodejs';

const bodySchema = z.object({ submitted: z.boolean() });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return Response.json({ error: 'bad id' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected {submitted: boolean}' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const run = await getRun(db, runId);
  if (!run || run.userId !== identity.userId) return Response.json({ error: 'not found' }, { status: 404 });

  const updated = await setRunSubmitted(db, runId, parsed.data.submitted);
  return Response.json({ ok: true, submitted: updated?.submittedAt != null, status: updated?.status ?? run.status });
}
