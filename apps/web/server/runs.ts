import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import type { FeedbackAction, NewRun, Preference, ProcessedEmail, Profile, Run, TriggerRulesRow } from '@/server/db/schema';

/**
 * Data-access helpers shared by the email pipeline (server/pipeline/*) and
 * the UI/API routes. Deliberately thin: every function takes a `Db` so the
 * same code runs against D1 in the Worker and better-sqlite3 in tests, and
 * none of them reach for the LLM, R2 or the mailer — those stay in the
 * pipeline, which composes these calls.
 */

/* ------------------------------------------------------------------------ */
/* Processed emails (dedupe ledger)                                          */
/* ------------------------------------------------------------------------ */

export interface ProcessedEmailInput {
  messageId: string;
  source: ProcessedEmail['source'];
  subject?: string | null;
  receivedAt?: string | null;
  jobsFound?: number;
  status: ProcessedEmail['status'];
  error?: string | null;
}

/** The ledger row for a Message-ID, or null if this message has never been seen — the pipeline's first check on every inbound mail. */
export async function findProcessedEmail(db: Db, messageId: string): Promise<ProcessedEmail | null> {
  const row = await db.query.processedEmails.findFirst({ where: eq(schema.processedEmails.messageId, messageId) });
  return row ?? null;
}

/**
 * Record (or update) the outcome of handling one inbound message. Upserts on
 * `message_id` so a message first logged as 'failed' can be re-logged as
 * 'processed' after a successful retry without a second row.
 */
export async function recordProcessedEmail(db: Db, input: ProcessedEmailInput): Promise<ProcessedEmail> {
  const values = {
    messageId: input.messageId,
    source: input.source,
    subject: input.subject ?? null,
    receivedAt: input.receivedAt ?? null,
    jobsFound: input.jobsFound ?? 0,
    status: input.status,
    error: input.error ?? null,
  };
  const [row] = await db
    .insert(schema.processedEmails)
    .values(values)
    .onConflictDoUpdate({
      target: schema.processedEmails.messageId,
      set: { source: values.source, subject: values.subject, receivedAt: values.receivedAt, jobsFound: values.jobsFound, status: values.status, error: values.error },
    })
    .returning();
  return row;
}

/* ------------------------------------------------------------------------ */
/* Runs                                                                      */
/* ------------------------------------------------------------------------ */

export type CreateRunInput = Omit<NewRun, 'id' | 'createdAt' | 'updatedAt'>;

/** Per-user idempotency lookup — a re-forwarded alert must not produce a second pack for the same Seek job. */
export async function findRunBySeekJobId(db: Db, userId: number, seekJobId: string): Promise<Run | null> {
  const row = await db.query.runs.findFirst({
    where: and(eq(schema.runs.userId, userId), eq(schema.runs.seekJobId, seekJobId)),
  });
  return row ?? null;
}

export async function createRun(db: Db, input: CreateRunInput): Promise<Run> {
  const [row] = await db.insert(schema.runs).values(input).returning();
  return row;
}

/** Partial update; always bumps `updated_at`. Returns the fresh row, or null when the run doesn't exist. */
export async function updateRun(db: Db, runId: number, patch: Partial<CreateRunInput>): Promise<Run | null> {
  const [row] = await db
    .update(schema.runs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.runs.id, runId))
    .returning();
  return row ?? null;
}

export async function getRun(db: Db, runId: number): Promise<Run | null> {
  const row = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
  return row ?? null;
}

/** Newest first (created_at, then id as the tiebreak for rows created in the same second). */
export async function listRuns(db: Db, userId: number, opts: { limit?: number } = {}): Promise<Run[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
  return db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.userId, userId))
    .orderBy(desc(schema.runs.createdAt), desc(schema.runs.id))
    .limit(limit);
}

/* ------------------------------------------------------------------------ */
/* Feedback                                                                  */
/* ------------------------------------------------------------------------ */

/** Actions that move the run's lifecycle; 'thumbs-up' is a signal only and leaves `status` alone. */
const STATUS_FLIPPING_ACTIONS: Partial<Record<FeedbackAction, Run['status']>> = {
  applied: 'applied',
  rejected: 'rejected',
  regenerate: 'regenerate',
};

/**
 * Record a review action (from the email's one-click links or the UI):
 * appends a `feedback` row, flips `runs.status` for applied/rejected/
 * regenerate, and — when the user gave a reason — captures it as a
 * `preferences` row (source 'feedback', kind 'note') so the next tailoring
 * prompt learns from it. Throws if the run doesn't exist.
 */
export async function recordFeedback(
  db: Db,
  runId: number,
  action: FeedbackAction,
  reason?: string | null
): Promise<{ run: Run; feedbackId: number; preferenceId: number | null }> {
  const existing = await getRun(db, runId);
  if (!existing) throw new Error(`run ${runId} not found`);

  const trimmedReason = reason?.trim() || null;
  const [fb] = await db.insert(schema.feedback).values({ runId, action, reason: trimmedReason }).returning();

  const nextStatus = STATUS_FLIPPING_ACTIONS[action];
  const run = nextStatus ? ((await updateRun(db, runId, { status: nextStatus })) ?? existing) : existing;

  let preferenceId: number | null = null;
  if (trimmedReason) {
    const [pref] = await db
      .insert(schema.preferences)
      .values({ userId: existing.userId, kind: 'note', text: trimmedReason, source: 'feedback', runId })
      .returning();
    preferenceId = pref.id;
  }

  return { run, feedbackId: fb.id, preferenceId };
}

/* ------------------------------------------------------------------------ */
/* Profiles, trigger rules, preferences                                      */
/* ------------------------------------------------------------------------ */

/**
 * The profile the pipeline tailors from. Returns the row flagged
 * `is_default`; if the user has profiles but none is flagged (e.g. the
 * default was deleted), promotes the oldest one so the pipeline never
 * stalls on a fixable state. Null only when the user has no profile at all.
 */
export async function getOrCreateDefaultProfile(db: Db, userId: number): Promise<Profile | null> {
  const flagged = await db.query.profiles.findFirst({
    where: and(eq(schema.profiles.userId, userId), eq(schema.profiles.isDefault, true)),
  });
  if (flagged) return flagged;

  const oldest = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    orderBy: asc(schema.profiles.id),
  });
  if (!oldest) return null;

  const [promoted] = await db
    .update(schema.profiles)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(schema.profiles.id, oldest.id))
    .returning();
  return promoted;
}

/** The user's trigger rules row (rules_json is opaque here — the pipeline parses it), or null when never saved. */
export async function getTriggerRules(db: Db, userId: number): Promise<TriggerRulesRow | null> {
  const row = await db.query.triggerRules.findFirst({ where: eq(schema.triggerRules.userId, userId) });
  return row ?? null;
}

/** Upsert the user's trigger rules (one row per user). */
export async function saveTriggerRules(db: Db, userId: number, rulesJson: string): Promise<TriggerRulesRow> {
  const values = { userId, rulesJson, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.triggerRules)
    .values(values)
    .onConflictDoUpdate({ target: schema.triggerRules.userId, set: { rulesJson: values.rulesJson, updatedAt: values.updatedAt } })
    .returning();
  return row;
}

/** All steering notes for the tailoring prompt, oldest first (so later feedback reads as a refinement of earlier notes). */
export async function listPreferences(db: Db, userId: number): Promise<Preference[]> {
  return db
    .select()
    .from(schema.preferences)
    .where(eq(schema.preferences.userId, userId))
    .orderBy(asc(schema.preferences.createdAt), asc(schema.preferences.id));
}

/**
 * Guarantee the default user row exists (DEFAULT_USER_ID). Migration 0001 seeds
 * it, but the pipeline must never depend on that: an inbound email on a fresh
 * database used to fail the users foreign key and bounce Gmail's own forwarding
 * confirmation. Idempotent; safe to call on every inbound message.
 */
export async function ensureDefaultUser(db: Db): Promise<void> {
  await db
    .insert(schema.users)
    .values({ id: DEFAULT_USER_ID, name: 'Default' })
    .onConflictDoNothing({ target: schema.users.id });
}
