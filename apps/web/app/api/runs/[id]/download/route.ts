import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { getRun } from '@/server/runs';

/**
 * GET /api/runs/[id]/download?doc=cv|letter — streams the rendered .docx
 * from R2 (DOCS bucket) by the key stored on the run. 404 when the run has
 * no such document yet (skipped/failed runs) or the object is gone.
 */
export const runtime = 'nodejs';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document';
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return Response.json({ error: 'bad id' }, { status: 400 });

  const doc = new URL(request.url).searchParams.get('doc');
  if (doc !== 'cv' && doc !== 'letter') return Response.json({ error: 'doc must be cv or letter' }, { status: 400 });

  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const run = await getRun(db, runId);
  if (!run || run.userId !== identity.userId) return Response.json({ error: 'not found' }, { status: 404 });

  const key = doc === 'cv' ? run.cvKey : run.letterKey;
  if (!key) return Response.json({ error: `no ${doc} for this run` }, { status: 404 });

  const object = await env.DOCS.get(key);
  if (!object) return Response.json({ error: 'document missing from storage' }, { status: 404 });

  const filename = `${doc === 'cv' ? 'CV' : 'Cover_letter'}_${safeName(run.company ?? 'job')}_${safeName(run.jobTitle)}.docx`;
  return new Response(object.body as unknown as BodyInit, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? DOCX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
