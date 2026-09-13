import type { Config } from 'drizzle-kit';

/**
 * Local schema→SQL generation. D1 is SQLite-dialect, so `npm run db:generate`
 * emits D1-compatible SQL into server/db/migrations; those files are applied
 * with `wrangler d1 migrations apply applyforme-db --local|--remote`.
 */
export default {
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  verbose: true,
  strict: true,
} satisfies Config;
