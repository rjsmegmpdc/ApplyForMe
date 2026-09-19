import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, getEnv, schema } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { listPreferences } from '@/server/runs';

/**
 * GET/POST/DELETE /api/preferences — the steering notes injected into the
 * tailoring prompt. POST creates a manual entry; DELETE takes {id} and only
 * removes the caller's own row (a foreign id is a silent no-op → 404).
 */
export const runtime = 'nodejs';

const createSchema = z.object({
  kind: z.enum(['tone', 'avoid', 'emphasise', 'note', 'exemplar']),
  text: z.string().trim().min(1).max(1000),
});

const deleteSchema = z.object({ id: z.number().int().positive() });

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const preferences = await listPreferences(db, identity.userId);
  return Response.json({ preferences });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected {kind, text}' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const [row] = await db
    .insert(schema.preferences)
    .values({ userId: identity.userId, kind: parsed.data.kind, text: parsed.data.text, source: 'manual' })
    .returning();
  return Response.json({ ok: true, preference: row }, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected {id}' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const deleted = await db
    .delete(schema.preferences)
    .where(and(eq(schema.preferences.id, parsed.data.id), eq(schema.preferences.userId, identity.userId)))
    .returning({ id: schema.preferences.id });
  if (deleted.length === 0) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ ok: true });
}
