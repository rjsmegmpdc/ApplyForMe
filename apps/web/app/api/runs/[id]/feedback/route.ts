import { z } from 'zod';
import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getRun, recordFeedback } from '@/server/runs';

/**
 * POST /api/runs/[id]/feedback — the UI's action buttons (Applied · Not for
 * me · Regenerate · Thumbs up). Session-authenticated through Access; the
 * email's one-click links use the signed /action route instead.
 */
export const runtime = 'nodejs';

const bodySchema = z.object({
  action: z.enum(['applied', 'rejected', 'regenerate', 'thumbs-up']),
  reason: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return Response.json({ error: 'bad id' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected {action, reason?}' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const run = await getRun(db, runId);
  if (!run || run.userId !== identity.userId) return Response.json({ error: 'not found' }, { status: 404 });

  const result = await recordFeedback(db, runId, parsed.data.action, parsed.data.reason ?? null);
  return Response.json({ ok: true, status: result.run.status, feedbackId: result.feedbackId, preferenceId: result.preferenceId });
}
