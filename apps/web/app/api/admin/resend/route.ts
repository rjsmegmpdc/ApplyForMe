import { z } from 'zod';
import { getEnv } from '@/server/db';
import { isAdminRequest } from '@/server/admin-auth';
import { buildPipelineDeps } from '@/server/pipeline/inbound-handler';
import { resendRun } from '@/server/pipeline/run-job';

/**
 * POST /api/admin/resend — { runId } (or { runIds: [...] }) re-sends the
 * stored pack(s) with fresh action links; no model call. Bearer ADMIN_TOKEN,
 * same rules as /api/admin/run-url.
 */
export const runtime = 'nodejs';

const bodySchema = z.object({
  runId: z.number().int().positive().optional(),
  runIds: z.array(z.number().int().positive()).max(50).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const auth = isAdminRequest(request, env);
  if (auth === 'unconfigured') return Response.json({ error: 'admin token not configured' }, { status: 503 });
  if (auth === 'unauthorized') return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const ids = parsed.success ? [...(parsed.data.runIds ?? []), ...(parsed.data.runId ? [parsed.data.runId] : [])] : [];
  if (!ids.length) return Response.json({ error: 'runId or runIds required' }, { status: 400 });

  const deps = buildPipelineDeps(env);
  const results = [];
  for (const id of ids) results.push(await resendRun(deps, id, parsed.success ? parsed.data.note : undefined));
  return Response.json({ results });
}
