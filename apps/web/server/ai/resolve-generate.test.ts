import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { createTestDb, seedUser } from '@/server/test/db';
import { saveLlmCredentials } from '@/server/adapters/llm-credentials';
import { resolveGenerateFn } from './resolve-generate';
import type { GenerateFn } from './anthropic';

const ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
const USER = schema.DEFAULT_USER_ID;

/** Records which key each GenerateFn was built with, without touching the SDK. */
function makeFake(): { make: (apiKey: string) => GenerateFn; keys: string[] } {
  const keys: string[] = [];
  const make = (apiKey: string): GenerateFn => {
    keys.push(apiKey);
    return async () => ({ parsed: null, raw: '', usage: { input: 0, output: 0, cacheRead: 0 } });
  };
  return { make, keys };
}

describe('resolveGenerateFn (personal key → server key → none)', () => {
  let db: Db;
  beforeEach(async () => {
    db = createTestDb().db;
    await seedUser(db);
  });

  it('returns none when neither key exists', async () => {
    const { make, keys } = makeFake();
    const resolved = await resolveGenerateFn(db, { ANTHROPIC_API_KEY: undefined, TOKENS_ENC_KEY: ENC_KEY }, USER, make);
    expect(resolved).toEqual({ generate: null, provider: 'none' });
    expect(keys).toEqual([]);
  });

  it('uses the server key when there is no personal key', async () => {
    const { make, keys } = makeFake();
    const resolved = await resolveGenerateFn(db, { ANTHROPIC_API_KEY: 'sk-server', TOKENS_ENC_KEY: ENC_KEY }, USER, make);
    expect(resolved.provider).toBe('anthropic-server');
    expect(resolved.generate).toBeTypeOf('function');
    expect(keys).toEqual(['sk-server']);
  });

  it('a personal key wins over the server key', async () => {
    await saveLlmCredentials(db, ENC_KEY, USER, 'anthropic', 'sk-personal');
    const { make, keys } = makeFake();
    const resolved = await resolveGenerateFn(db, { ANTHROPIC_API_KEY: 'sk-server', TOKENS_ENC_KEY: ENC_KEY }, USER, make);
    expect(resolved.provider).toBe('anthropic-personal');
    expect(keys).toEqual(['sk-personal']);
  });

  it('without TOKENS_ENC_KEY a stored personal key cannot be read, so the server key is used', async () => {
    await saveLlmCredentials(db, ENC_KEY, USER, 'anthropic', 'sk-personal');
    const { make, keys } = makeFake();
    const resolved = await resolveGenerateFn(db, { ANTHROPIC_API_KEY: 'sk-server', TOKENS_ENC_KEY: undefined }, USER, make);
    expect(resolved.provider).toBe('anthropic-server');
    expect(keys).toEqual(['sk-server']);
  });
});
