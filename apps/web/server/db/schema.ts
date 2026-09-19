import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { UserProfile } from '@applyforme/engine';

/**
 * Drizzle schema for the ApplyForMe D1 database (SQLite dialect).
 *
 * Conventions (ported from AICoach): snake_case column names, integer
 * timestamps in `mode: 'timestamp'` (seconds since epoch, `unixepoch()`
 * default), doc comments on every non-obvious column, and `user_id` on every
 * per-user table from day one even though v2 is single-user — identity
 * resolution (server/identity.ts) finds-or-creates rows by Access email, so
 * a second user simply gets a second row.
 *
 * Schema changes are additive: run `npm run db:generate -w @applyforme/web`
 * to emit a new migration under server/db/migrations — that directory is the
 * single source of truth for both D1 (`wrangler d1 migrations apply`) and
 * the in-memory test database (server/test/db.ts).
 */

/* ----------------------------------------------------------------------------
 * Users — one row per Cloudflare Access identity. `email` is nullable only
 * for the dev-mode fallback row (id 1, no Access configured locally);
 * `review_email` is where the tailored pack is sent and defaults to the
 * identity email when null.
 * -------------------------------------------------------------------------- */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Cloudflare Access identity email — unique, nullable (dev row). Always stored lowercase (server/identity.ts normalises before every read/write). */
    email: text('email'),
    name: text('name').notNull(),
    /** Where the review pack is emailed. Null = use `email`. Kept separate so the user can route packs to a different inbox than their login identity. */
    reviewEmail: text('review_email'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    /** Identity resolution finds a user by email; case-insensitivity is enforced by always lowercasing before insert/lookup, never at the DB layer. */
    usersEmailUnique: uniqueIndex('users_email_unique').on(t.email),
  })
);

export type User = typeof users.$inferSelect;

/** Seeded single-user id — every per-user row defaults to this until a second identity signs in. */
export const DEFAULT_USER_ID = 1;

/* ----------------------------------------------------------------------------
 * Profiles — the full UserProfile JSON (packages/engine types) the tailoring
 * prompt is built from. A user may keep several (e.g. "Modern Workplace
 * lead" vs "Service Delivery manager"); exactly one should be `is_default`
 * and is what the email pipeline uses when a trigger rule doesn't name one.
 * -------------------------------------------------------------------------- */
export const profiles = sqliteTable(
  'profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .default(DEFAULT_USER_ID)
      .references(() => users.id),
    /** Human label shown in the UI, e.g. "Modern Workplace lead". */
    name: text('name').notNull(),
    /** The engine's `UserProfile`, stored as JSON text (Drizzle `mode: 'json'` parses/serialises at the boundary — callers see the typed object). */
    profileJson: text('profile_json', { mode: 'json' }).$type<UserProfile>().notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    profilesUserIdx: index('profiles_user_idx').on(t.userId),
  })
);

export type Profile = typeof profiles.$inferSelect;

/* ----------------------------------------------------------------------------
 * Trigger rules — one JSON blob per user deciding which alert jobs get a
 * tailored pack (match threshold, title keywords, location filters, …).
 * Stored as opaque JSON so the rule shape can evolve in the engine without a
 * migration; unique on user_id (upsert semantics).
 * -------------------------------------------------------------------------- */
export const triggerRules = sqliteTable('trigger_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .default(DEFAULT_USER_ID)
    .references(() => users.id)
    .unique(),
  rulesJson: text('rules_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

export type TriggerRulesRow = typeof triggerRules.$inferSelect;

/* ----------------------------------------------------------------------------
 * Preferences — short free-text steering notes that feed the tailoring
 * prompt ("tone: direct, no fluff"; "avoid: buzzwords"; "emphasise: M365
 * migrations"). `source` records whether the user typed it in the UI or it
 * was captured from a review-email feedback reason (run_id links back).
 * -------------------------------------------------------------------------- */
export const preferences = sqliteTable(
  'preferences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .default(DEFAULT_USER_ID)
      .references(() => users.id),
    kind: text('kind', { enum: ['tone', 'avoid', 'emphasise', 'note'] }).notNull(),
    text: text('text').notNull(),
    source: text('source', { enum: ['manual', 'feedback'] }).notNull().default('manual'),
    /** The run whose feedback produced this preference — null for manual entries. */
    runId: integer('run_id').references(() => runs.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    preferencesUserIdx: index('preferences_user_idx').on(t.userId),
  })
);

export type Preference = typeof preferences.$inferSelect;

/* ----------------------------------------------------------------------------
 * Processed emails — dedupe ledger for the `email` handler. `message_id` is
 * the RFC 5322 Message-ID, or a sha-256 of the raw message when the header
 * is missing (server/email/inbound.ts). Every inbound message gets a row,
 * even non-Seek ones (`status='ignored'`), so a redelivery is a no-op.
 * -------------------------------------------------------------------------- */
export const processedEmails = sqliteTable(
  'processed_emails',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id').notNull(),
    source: text('source', { enum: ['seek', 'linkedin', 'other'] }).notNull(),
    subject: text('subject'),
    /** The message's own Date header (ISO string) — null when absent/unparseable. */
    receivedAt: text('received_at'),
    jobsFound: integer('jobs_found').notNull().default(0),
    status: text('status', { enum: ['processed', 'ignored', 'failed'] }).notNull(),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    processedEmailsMessageIdUnique: uniqueIndex('processed_emails_message_id_unique').on(t.messageId),
  })
);

export type ProcessedEmail = typeof processedEmails.$inferSelect;

/* ----------------------------------------------------------------------------
 * Runs — one row per (user, Seek job) the pipeline has looked at. Carries
 * the job as extracted, the analysis + trigger decision, the tailored output
 * and the delivery state. `status` is the lifecycle: pending → skipped (rule
 * said no) | sent (pack emailed) | failed; the review-email action links then
 * move a sent run to applied | rejected | regenerate (server/runs.ts
 * recordFeedback). The (user_id, seek_job_id) unique index is what makes a
 * re-forwarded alert idempotent.
 * -------------------------------------------------------------------------- */
export const runs = sqliteTable(
  'runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .default(DEFAULT_USER_ID)
      .references(() => users.id),
    /** Profile used for tailoring — null when the run was skipped before a profile was chosen. */
    profileId: integer('profile_id').references(() => profiles.id),
    /** The inbound alert this job came from — null for runs created outside the email path (manual URL paste, tests). */
    processedEmailId: integer('processed_email_id').references(() => processedEmails.id),
    /** Seek's numeric job id as a string (from the alert's /job/<id> link). */
    seekJobId: text('seek_job_id').notNull(),
    jobTitle: text('job_title').notNull(),
    company: text('company'),
    location: text('location'),
    /** Salary exactly as the alert/ad printed it — never parsed into numbers here. */
    salaryText: text('salary_text'),
    jobUrl: text('job_url').notNull(),
    /** Full ad text when fetched, otherwise the alert snippet — `job_text_source` says which. */
    jobText: text('job_text').notNull(),
    jobTextSource: text('job_text_source', { enum: ['full-ad', 'alert-snippet'] }).notNull(),
    matchPercentage: integer('match_percentage'),
    /** Serialised engine analysis (keyword/benefit matching). */
    analysisJson: text('analysis_json'),
    /** Serialised trigger decision `{ decision, reasons }` — why this run was or wasn't tailored. */
    triggerJson: text('trigger_json'),
    /** Serialised tailored output (CV sections + cover letter) from the LLM step. */
    tailoredJson: text('tailored_json'),
    /** Provenance of `tailored_json`: live LLM, live-but-repaired JSON, deterministic fallback, or none (not tailored). */
    origin: text('origin', { enum: ['live', 'live-repaired', 'fallback', 'none'] }),
    status: text('status', {
      enum: ['pending', 'skipped', 'sent', 'failed', 'applied', 'rejected', 'regenerate'],
    })
      .notNull()
      .default('pending'),
    /** R2 object keys (DOCS bucket) of the rendered .docx files. */
    cvKey: text('cv_key'),
    letterKey: text('letter_key'),
    /** Message-ID returned by the outbound send — lets a reply be threaded/traced. */
    emailMessageId: text('email_message_id'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    runsUserSeekJobUnique: uniqueIndex('runs_user_seek_job_unique').on(t.userId, t.seekJobId),
    runsSeekJobIdx: index('runs_seek_job_idx').on(t.seekJobId),
    runsUserCreatedIdx: index('runs_user_created_idx').on(t.userId, t.createdAt),
    runsStatusIdx: index('runs_status_idx').on(t.status),
  })
);

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunStatus = Run['status'];

/* ----------------------------------------------------------------------------
 * Feedback — every one-click action from the review email (or the UI), kept
 * as an append-only log even though `runs.status` also reflects the latest
 * one. `reason` is the optional free text that becomes a `preferences` row.
 * -------------------------------------------------------------------------- */
export const feedback = sqliteTable(
  'feedback',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id),
    action: text('action', { enum: ['applied', 'rejected', 'regenerate', 'thumbs-up'] }).notNull(),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  },
  (t) => ({
    feedbackRunIdx: index('feedback_run_idx').on(t.runId),
  })
);

export type Feedback = typeof feedback.$inferSelect;
export type FeedbackAction = Feedback['action'];

/* ----------------------------------------------------------------------------
 * LLM credentials — per-user "bring your own Anthropic key", encrypted at
 * rest under TOKENS_ENC_KEY (server/adapters/token-crypto.ts). `provider`
 * stays a plain string rather than a closed enum so a future provider never
 * needs a migration just to add a value.
 * -------------------------------------------------------------------------- */
export const llmCredentials = sqliteTable('llm_credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .default(DEFAULT_USER_ID)
    .references(() => users.id)
    .unique(),
  provider: text('provider').notNull().default('anthropic'),
  apiKeyEnc: text('api_key_enc').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
});

export type LlmCredentialRow = typeof llmCredentials.$inferSelect;
