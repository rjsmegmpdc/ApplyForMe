import { z } from 'zod';
import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { countHeldRuns, getSendsPausedAt, setSendingPaused, settleHeldRuns } from '@/server/runs';

/**
 * GET  /api/settings/sending — { paused, pausedAt, held }
 * POST /api/settings/sending — { paused: boolean } turns sending off/on;
 *                              { held: 'release' | 'discard' } settles jobs held while paused.
 * Session-authenticated through Access.
 */
export const runtime = 'nodejs';

const bodySchema = z.union([z.object({ paused: z.boolean() }), z.object({ held: z.enum(['release', 'discard']) })]);

async function state(db: ReturnType<typeof getDb>, userId: number) {
  const [pausedAt, held] = await Promise.all([getSendsPausedAt(db, userId), countHeldRuns(db, userId)]);
  return { paused: pausedAt != null, pausedAt: pausedAt?.toISOString() ?? null, held };
}

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await state(db, identity.userId));
}

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "expected {paused: boolean} or {held: 'release' | 'discard'}" }, { status: 400 });
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let settled: number | undefined;
  if ('paused' in parsed.data) {
    await setSendingPaused(db, identity.userId, parsed.data.paused);
  } else {
    if (await getSendsPausedAt(db, identity.userId)) return Response.json({ error: 'turn sending on before releasing held jobs' }, { status: 409 });
    settled = await settleHeldRuns(db, identity.userId, parsed.data.held);
  }
  return Response.json({ ok: true, ...(await state(db, identity.userId)), ...(settled !== undefined ? { settled } : {}) });
}
