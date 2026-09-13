import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { listRuns } from '@/server/runs';

/** GET /api/runs — the caller's runs, newest first (limit 100, matching the inbox page). */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const identity = await resolveUser(request.headers, db, getEnv());
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const runs = await listRuns(db, identity.userId, { limit: 100 });
  return Response.json({ runs });
}
