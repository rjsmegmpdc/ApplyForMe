import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';

/**
 * Settings › Delete my account (Matt, 2026-11-25; Privacy Act 2020). Deletes the user row and every row that
 * belongs to it, in every table, plus the user's generated documents in R2. Nothing is kept: coming back
 * through Access later creates a brand-new, empty user.
 *
 * USER_TABLES is the inventory, in delete order (children first, so foreign keys hold).
 * server/account-delete.test.ts reads the live schema's foreign keys and fails if a table that references
 * users or runs is missing here.
 */
export const USER_TABLES = ['feedback', 'preferences', 'runs', 'profiles', 'trigger_rules', 'llm_credentials', 'users'] as const;

/** Tables that hold no per-user data and are deliberately not touched (see the comment on each). */
export const NOT_USER_TABLES = {
  /** Dedupe ledger of inbound alert emails. Has no user id: the email pipeline only ever runs for the owner account, which cannot be deleted here. */
  processed_emails: 'owner pipeline ledger',
} as const;

export type DeletionBlocker = 'owner' | 'no-identity';

/** Why this account can't be deleted from Settings (empty = it can). */
export function deletionBlockers(userId: number, email: string | null): DeletionBlocker[] {
  const out: DeletionBlocker[] = [];
  if (email == null) out.push('no-identity');
  if (userId === DEFAULT_USER_ID) out.push('owner');
  return out;
}

export function blockerText(b: DeletionBlocker): string {
  return b === 'owner'
    ? 'This is the owner account: the email pipeline runs for it, so it can’t be deleted here.'
    : 'Sign in as yourself through Cloudflare Access to delete an account.';
}

export interface R2Like {
  delete(keys: string | string[]): Promise<void>;
  list(opts: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

export interface DeletionResult {
  deleted: Record<(typeof USER_TABLES)[number], number>;
  documents: number;
}

async function listAll(docs: R2Like, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await docs.list({ prefix, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/**
 * Delete everything for `userId`. Callers check deletionBlockers first; this refuses the owner account itself
 * as a second line of defence. Documents go first, so a failure there leaves the rows (and the keys to retry).
 */
export async function deleteAccountData(db: Db, userId: number, docs: R2Like | null): Promise<DeletionResult> {
  if (userId === DEFAULT_USER_ID) throw new Error('the owner account cannot be deleted');

  const runs = await db.select({ id: schema.runs.id, cvKey: schema.runs.cvKey, letterKey: schema.runs.letterKey }).from(schema.runs).where(eq(schema.runs.userId, userId));
  const runIds = runs.map((r) => r.id);

  let documents = 0;
  if (docs) {
    const keys = new Set<string>();
    for (const r of runs) {
      if (r.cvKey) keys.add(r.cvKey);
      if (r.letterKey) keys.add(r.letterKey);
      for (const k of await listAll(docs, `runs/${r.id}/`)) keys.add(k);
    }
    const all = [...keys];
    for (let i = 0; i < all.length; i += 1000) await docs.delete(all.slice(i, i + 1000));
    documents = all.length;
  }

  const n = (rows: unknown[]) => rows.length;
  const deleted = {} as DeletionResult['deleted'];
  deleted.feedback = runIds.length ? n(await db.delete(schema.feedback).where(inArray(schema.feedback.runId, runIds)).returning({ id: schema.feedback.id })) : 0;
  // Preferences of this user, plus any other row still pointing at one of this user's runs (none expected).
  deleted.preferences = n(await db.delete(schema.preferences).where(eq(schema.preferences.userId, userId)).returning({ id: schema.preferences.id }));
  if (runIds.length) deleted.preferences += n(await db.delete(schema.preferences).where(inArray(schema.preferences.runId, runIds)).returning({ id: schema.preferences.id }));
  deleted.runs = n(await db.delete(schema.runs).where(eq(schema.runs.userId, userId)).returning({ id: schema.runs.id }));
  deleted.profiles = n(await db.delete(schema.profiles).where(eq(schema.profiles.userId, userId)).returning({ id: schema.profiles.id }));
  deleted.trigger_rules = n(await db.delete(schema.triggerRules).where(eq(schema.triggerRules.userId, userId)).returning({ id: schema.triggerRules.id }));
  deleted.llm_credentials = n(await db.delete(schema.llmCredentials).where(eq(schema.llmCredentials.userId, userId)).returning({ id: schema.llmCredentials.id }));
  deleted.users = n(await db.delete(schema.users).where(eq(schema.users.id, userId)).returning({ id: schema.users.id }));
  return { deleted, documents };
}
