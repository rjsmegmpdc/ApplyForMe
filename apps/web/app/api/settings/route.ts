import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, getEnv, schema } from '@/server/db';
import { resolveUser } from '@/server/identity';

/**
 * GET/PATCH /api/settings — the review-pack recipient. `reviewEmail` null
 * means "use the Access identity email"; `effectiveReviewEmail` is what the
 * pipeline will actually send to (null in dev mode with nothing set).
 */
export const runtime = 'nodejs';

const patchSchema = z.object({
  reviewEmail: z.union([z.string().trim().email().max(200), z.literal(''), z.null()]),
});

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, identity.userId) });
  const reviewEmail = user?.reviewEmail ?? null;
  return Response.json({
    email: user?.email ?? null,
    reviewEmail,
    effectiveReviewEmail: reviewEmail ?? user?.email ?? null,
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected {reviewEmail: string|null}' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const reviewEmail = parsed.data.reviewEmail ? parsed.data.reviewEmail.toLowerCase() : null;
  await db.update(schema.users).set({ reviewEmail }).where(eq(schema.users.id, identity.userId));
  return Response.json({ ok: true, reviewEmail });
}
