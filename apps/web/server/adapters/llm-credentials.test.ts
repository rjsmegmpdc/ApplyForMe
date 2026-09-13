import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { createTestDb, seedUser } from '@/server/test/db';
import { resolveLlmCredentials, llmCredentialSource, saveLlmCredentials, clearLlmCredentials } from './llm-credentials';

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
const USER = schema.DEFAULT_USER_ID;

describe('LLM credential resolution (personal wins, env is the fallback)', () => {
  let db: Db;
  beforeEach(async () => {
    db = createTestDb().db;
    await seedUser(db);
  });

  it('resolves the env fallback when no personal key exists', async () => {
    const resolved = await resolveLlmCredentials(db, KEY, 'sk-ant-server-key', USER);
    expect(resolved).toEqual({ apiKey: 'sk-ant-server-key', source: 'server-default' });
  });

  it('resolves null when neither personal nor env key exists', async () => {
    expect(await resolveLlmCredentials(db, KEY, undefined, USER)).toBeNull();
  });

  it('a personal key wins over the env fallback', async () => {
    await saveLlmCredentials(db, KEY, USER, 'anthropic', 'sk-ant-personal-key');
    const resolved = await resolveLlmCredentials(db, KEY, 'sk-ant-server-key', USER);
    expect(resolved).toEqual({ apiKey: 'sk-ant-personal-key', source: 'personal' });
  });

  it('round-trips the personal key through encryption — never stored as plaintext', async () => {
    await saveLlmCredentials(db, KEY, USER, 'anthropic', 'sk-ant-super-secret');
    const row = await db.query.llmCredentials.findFirst({ where: eq(schema.llmCredentials.userId, USER) });
    expect(row).toBeTruthy();
    expect(row!.apiKeyEnc).not.toContain('sk-ant-super-secret');
    expect(row!.provider).toBe('anthropic');

    const resolved = await resolveLlmCredentials(db, KEY, undefined, USER);
    expect(resolved).toEqual({ apiKey: 'sk-ant-super-secret', source: 'personal' });
  });

  it('saveLlmCredentials upserts — a second save replaces, does not duplicate', async () => {
    await saveLlmCredentials(db, KEY, USER, 'anthropic', 'sk-ant-first');
    await saveLlmCredentials(db, KEY, USER, 'anthropic', 'sk-ant-second');
    const rows = await db.select().from(schema.llmCredentials);
    expect(rows).toHaveLength(1);
    const resolved = await resolveLlmCredentials(db, KEY, undefined, USER);
    expect(resolved?.apiKey).toBe('sk-ant-second');
  });

  it('clearLlmCredentials removes the personal row and falls back to env', async () => {
    await saveLlmCredentials(db, KEY, USER, 'anthropic', 'sk-ant-personal-key');
    await clearLlmCredentials(db, USER);
    const resolved = await resolveLlmCredentials(db, KEY, 'sk-ant-server-key', USER);
    expect(resolved?.source).toBe('server-default');
    expect(await resolveLlmCredentials(db, KEY, undefined, USER)).toBeNull();
  });
});

describe('llmCredentialSource — reports the source WITHOUT ever touching the key value', () => {
  let db: Db;
  beforeEach(async () => {
    db = createTestDb().db;
    await seedUser(db);
  });

  it('reports "not-configured" with nothing set', async () => {
    expect(await llmCredentialSource(db, undefined, USER)).toBe('not-configured');
  });

  it('reports "server-default" when only the env key exists', async () => {
    expect(await llmCredentialSource(db, 'sk-ant-server-key', USER)).toBe('server-default');
  });

  it('reports "personal" when a personal row exists, regardless of env', async () => {
    await saveLlmCredentials(db, KEY, USER, 'anthropic', 'sk-ant-personal-key');
    expect(await llmCredentialSource(db, 'sk-ant-server-key', USER)).toBe('personal');
    expect(await llmCredentialSource(db, undefined, USER)).not.toContain('sk-ant');
  });
});
