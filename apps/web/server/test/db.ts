import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import type { Db } from '../db';

/**
 * Test database — in-memory better-sqlite3 with the REAL generated D1
 * migrations applied (single source of truth: server/db/migrations, produced
 * by `npm run db:generate`). Tests therefore exercise the exact DDL D1 runs,
 * not a hand-maintained copy of it.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

export function createTestDb(): { db: Db; sqlite: InstanceType<typeof Database> } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    throw new Error(`No migrations in ${MIGRATIONS_DIR} — run \`npm run db:generate\` first`);
  }
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return { db, sqlite };
}

/** Seed the default user (id 1, test@example.com) that per-user tables default to. */
export async function seedUser(db: Db): Promise<void> {
  // Migration 0001 already seeds row 1 with no email; give it the test identity.
  await db
    .insert(schema.users)
    .values({ id: schema.DEFAULT_USER_ID, name: 'Test', email: 'test@example.com' })
    .onConflictDoUpdate({ target: schema.users.id, set: { name: 'Test', email: 'test@example.com' } });
}
