/**
 * Provider resolution — the one place that decides which Anthropic key a
 * tailoring call gets (pattern from AICoach's resolve-generate.ts, minus
 * the Workers AI tier and the per-purpose rules; ApplyForMe has one
 * purpose, tailoring, and one provider).
 *
 * Precedence: the user's personal key (encrypted at rest, decrypted via
 * resolveLlmCredentials — only possible when TOKENS_ENC_KEY is set) wins;
 * then the server's ANTHROPIC_API_KEY secret; otherwise `generate` is null
 * and the pipeline runs in deterministic-only mode (fallback documents,
 * clearly marked in the review email). Callers keep taking a plain
 * `GenerateFn`; this is the only module that knows keys exist.
 */
import type { Db } from '@/server/db';
import { resolveLlmCredentials } from '@/server/adapters/llm-credentials';
import { makeAnthropicGenerateFn, type GenerateFn } from './anthropic';

export type GenerateProvider = 'anthropic-personal' | 'anthropic-server' | 'none';

export interface ResolvedGenerate {
  generate: GenerateFn | null;
  /** Which source won — for the run log / UI, never a credential value. */
  provider: GenerateProvider;
}

export async function resolveGenerateFn(
  db: Db,
  env: Pick<CloudflareEnv, 'ANTHROPIC_API_KEY' | 'TOKENS_ENC_KEY'>,
  userId: number,
  makeGenerate: (apiKey: string) => GenerateFn = makeAnthropicGenerateFn
): Promise<ResolvedGenerate> {
  // Without the encryption key a stored personal key cannot be read, so only
  // the server fallback is consulted (resolveLlmCredentials would throw).
  const personal = env.TOKENS_ENC_KEY ? await resolveLlmCredentials(db, env.TOKENS_ENC_KEY, undefined, userId) : null;
  if (personal?.source === 'personal') {
    return { generate: makeGenerate(personal.apiKey), provider: 'anthropic-personal' };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { generate: makeGenerate(env.ANTHROPIC_API_KEY), provider: 'anthropic-server' };
  }
  return { generate: null, provider: 'none' };
}
