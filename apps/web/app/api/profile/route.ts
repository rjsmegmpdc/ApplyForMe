import { eq } from 'drizzle-orm';
import { getDb, getEnv, schema } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getOrCreateDefaultProfile } from '@/server/runs';
import { validateProfile } from '@/lib/ui/profile-schema';

/**
 * GET/PUT /api/profile — the default master profile. PUT takes the
 * `UserProfile` object itself as the body (validated by lib/ui/profile-schema)
 * and upserts: updates the default profile row, or creates one named
 * "Default" when the user has none yet.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const row = await getOrCreateDefaultProfile(db, identity.userId);
  if (!row) return Response.json({ profile: null });
  return Response.json({ profile: row.profileJson, id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString() });
}

export async function PUT(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const parsed = validateProfile(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const existing = await getOrCreateDefaultProfile(db, identity.userId);
  if (existing) {
    const [row] = await db
      .update(schema.profiles)
      .set({ profileJson: parsed.profile, updatedAt: new Date() })
      .where(eq(schema.profiles.id, existing.id))
      .returning();
    return Response.json({ ok: true, id: row.id, created: false });
  }
  const [row] = await db
    .insert(schema.profiles)
    .values({ userId: identity.userId, name: 'Default', profileJson: parsed.profile, isDefault: true })
    .returning();
  return Response.json({ ok: true, id: row.id, created: true });
}
