import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { encryptToken, decryptToken } from './token-crypto';

/**
 * LLM credentials — per-user "bring your own Anthropic key" (ported from
 * AICoach's server/adapters/llm-credentials.ts): the personal key wins, the
 * server's ANTHROPIC_API_KEY Worker secret is the fallback, and the personal
 * key is encrypted at rest under TOKENS_ENC_KEY (server/adapters/
 * token-crypto.ts) — no new secret, one envelope for every credential this
 * app stores. Only 'anthropic' is a real provider today; `provider` stays a
 * plain column value rather than a closed enum so a future provider never
 * needs another migration just to add a value.
 */

export type LlmCredentialSource = 'personal' | 'server-default' | 'not-configured';

export interface ResolvedLlmCredentials {
  apiKey: string;
  source: 'personal' | 'server-default';
}

/** Which source is currently active — never a credential value (presence-only contract, safe to render in the UI). */
export async function llmCredentialSource(db: Db, envAnthropicApiKey: string | undefined, userId: number): Promise<LlmCredentialSource> {
  const row = await db.query.llmCredentials.findFirst({ where: eq(schema.llmCredentials.userId, userId) });
  if (row) return 'personal';
  if (envAnthropicApiKey) return 'server-default';
  return 'not-configured';
}

/** Resolve a usable Anthropic API key (decrypted) — personal row wins, the env secret is the fallback, null when neither exists. */
export async function resolveLlmCredentials(
  db: Db,
  encKey: string,
  envAnthropicApiKey: string | undefined,
  userId: number
): Promise<ResolvedLlmCredentials | null> {
  const row = await db.query.llmCredentials.findFirst({ where: eq(schema.llmCredentials.userId, userId) });
  if (row) {
    return { apiKey: await decryptToken(row.apiKeyEnc, encKey), source: 'personal' };
  }
  if (envAnthropicApiKey) {
    return { apiKey: envAnthropicApiKey, source: 'server-default' };
  }
  return null;
}

/** Persist a user's personal LLM API key, encrypted at rest. */
export async function saveLlmCredentials(db: Db, encKey: string, userId: number, provider: string, apiKey: string): Promise<void> {
  const values = {
    userId,
    provider,
    apiKeyEnc: await encryptToken(apiKey, encKey),
    updatedAt: new Date(),
  };
  await db.insert(schema.llmCredentials).values(values).onConflictDoUpdate({ target: schema.llmCredentials.userId, set: values });
}

/** Remove a user's personal LLM credentials — subsequent calls fall back to the server default (or "not configured"). */
export async function clearLlmCredentials(db: Db, userId: number): Promise<void> {
  await db.delete(schema.llmCredentials).where(eq(schema.llmCredentials.userId, userId));
}
