import { getDb, getEnv } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { isAdminRequest } from '@/server/admin-auth';
import { getOrCreateDefaultProfile } from '@/server/runs';
import { rescoreRunsSalary } from '@/server/pipeline/rescore-salary';

/** POST /api/admin/rescore — re-score salary on the default user's runs against the current profile target. Bearer ADMIN_TOKEN. */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const auth = isAdminRequest(request, env);
  if (auth === 'unconfigured') return Response.json({ error: 'admin token not configured' }, { status: 503 });
  if (auth === 'unauthorized') return Response.json({ error: 'unauthorized' }, { status: 401 });
  const db = getDb();
  const profile = await getOrCreateDefaultProfile(db, DEFAULT_USER_ID);
  if (!profile) return Response.json({ error: 'no profile' }, { status: 404 });
  return Response.json(await rescoreRunsSalary(db, DEFAULT_USER_ID, profile.profileJson.salary_target));
}
