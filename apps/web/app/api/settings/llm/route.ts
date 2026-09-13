import { z } from 'zod';
import { getDb, getEnv } from '@/server/db';
import { resolveUser } from '@/server/identity';
import { clearLlmCredentials, llmCredentialSource, saveLlmCredentials } from '@/server/adapters/llm-credentials';

/**
 * GET/PUT/DELETE /api/settings/llm — personal Anthropic key (ported pattern
 * from AICoach). GET reports only which source is active — never a key
 * value. PUT stores an encrypted key (400 when TOKENS_ENC_KEY is missing);
 * DELETE falls back to the server default.
 */
export const runtime = 'nodejs';

const API_KEY_RE = /^sk-ant-.{10,}$/;

const putSchema = z.object({
  apiKey: z.string().trim().regex(API_KEY_RE, 'apiKey must be an Anthropic key (sk-ant-...)'),
});

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const source = await llmCredentialSource(db, env.ANTHROPIC_API_KEY, identity.userId);
  return Response.json({ source, hasPersonalKey: source === 'personal', canStore: Boolean(env.TOKENS_ENC_KEY) });
}

export async function PUT(request: Request): Promise<Response> {
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'expected {apiKey: "sk-ant-..."}' }, { status: 400 });

  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  if (!env.TOKENS_ENC_KEY) return Response.json({ error: 'encryption not configured (TOKENS_ENC_KEY)' }, { status: 400 });
  await saveLlmCredentials(db, env.TOKENS_ENC_KEY, identity.userId, 'anthropic', parsed.data.apiKey);
  return Response.json({ ok: true, source: 'personal' });
}

export async function DELETE(request: Request): Promise<Response> {
  const env = getEnv();
  const db = getDb();
  const identity = await resolveUser(request.headers, db, env);
  if ('error' in identity) return Response.json({ error: 'unauthorized' }, { status: 401 });

  await clearLlmCredentials(db, identity.userId);
  const source = await llmCredentialSource(db, env.ANTHROPIC_API_KEY, identity.userId);
  return Response.json({ ok: true, source });
}
