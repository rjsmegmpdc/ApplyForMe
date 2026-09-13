import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getTriggerRules, saveTriggerRules } from '@/server/runs';
import { rulesFromJson, triggerRulesSchema } from '@/lib/ui/rules-form';

/** GET/PUT /api/rules — the user's TriggerRules (engine shape). GET returns defaults when nothing is saved. */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const row = await getTriggerRules(db, identity.userId);
  return Response.json({ rules: rulesFromJson(row?.rulesJson), saved: row != null, updatedAt: row?.updatedAt.toISOString() ?? null });
}

export async function PUT(request: Request): Promise<Response> {
  const parsed = triggerRulesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected a TriggerRules object' }, { status: 400 });

  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const row = await saveTriggerRules(db, identity.userId, JSON.stringify(parsed.data));
  return Response.json({ ok: true, rules: parsed.data, updatedAt: row.updatedAt.toISOString() });
}
