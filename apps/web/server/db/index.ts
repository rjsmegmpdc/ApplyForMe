import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

/**
 * Database access. Inside Next route handlers the D1 binding comes from the
 * Cloudflare context. Server functions accept `Db` rather than calling
 * getDb() themselves so (a) tests can pass a better-sqlite3-backed drizzle
 * instance against the same schema and (b) the `email`/`scheduled` Worker
 * handlers — which have no request context — can build one from `env`.
 */
export type Db = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;

export function dbFromEnv(env: Pick<CloudflareEnv, 'DB'>): Db {
  return drizzle(env.DB, { schema }) as unknown as Db;
}

export function getDb(): Db {
  const { env } = getCloudflareContext();
  return dbFromEnv(env as CloudflareEnv);
}

export function getEnv(): CloudflareEnv {
  return getCloudflareContext().env as CloudflareEnv;
}

export { schema };
