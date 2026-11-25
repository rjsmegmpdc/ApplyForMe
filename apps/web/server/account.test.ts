import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import type { UserProfile } from '@applyforme/engine';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { DEFAULT_USER_ID } from '@/server/db/schema';
import { createTestDb, seedUser } from '@/server/test/db';
import { createRun, recordFeedback } from './runs';
import { applyCorrection, buildMyData, correctionSchema } from './account-data';
import { NOT_USER_TABLES, USER_TABLES, deleteAccountData, deletionBlockers, type R2Like } from './account-delete';

const PROFILE: UserProfile = {
  id: 'p1',
  personal: { name: 'Alex', email: 'alex@example.com', phone: '021 000', address: 'Wellington', linkedin: '', nationality: 'NZ', years_experience: 10 },
  executive_summary: 'Service delivery lead.',
  core_competencies: ['ITIL'],
  career_history: [],
  certifications_and_training: [],
};

class FakeR2 implements R2Like {
  objects = new Set<string>();
  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.objects.delete(k);
  }
  async list({ prefix }: { prefix: string }) {
    return { objects: [...this.objects].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
  }
}

let db: Db;
let sqlite: InstanceType<typeof Database>;
let r2: FakeR2;

/** A user with one of everything; returns its id and run ids. */
async function seedFullUser(email: string): Promise<{ userId: number; runIds: number[] }> {
  const [u] = await db.insert(schema.users).values({ name: email.split('@')[0], email, reviewEmail: `inbox+${email}` }).returning();
  const [p] = await db.insert(schema.profiles).values({ userId: u.id, name: 'Default', profileJson: PROFILE, isDefault: true }).returning();
  await db.insert(schema.triggerRules).values({ userId: u.id, rulesJson: '{}' });
  await db.insert(schema.preferences).values({ userId: u.id, kind: 'tone', text: 'direct' });
  await db.insert(schema.llmCredentials).values({ userId: u.id, apiKeyEnc: 'enc' });
  const runIds: number[] = [];
  for (const id of ['1', '2']) {
    const run = await createRun(db, { userId: u.id, profileId: p.id, seekJobId: `${email}-${id}`, jobTitle: `Job ${id}`, company: 'Acme', location: 'Wellington', salaryText: null, jobUrl: 'https://example.com', jobText: 'ad', jobTextSource: 'full-ad' });
    await db.update(schema.runs).set({ cvKey: `runs/${run.id}/cv.docx`, letterKey: `runs/${run.id}/letter.docx` }).where(eq(schema.runs.id, run.id));
    r2.objects.add(`runs/${run.id}/cv.docx`).add(`runs/${run.id}/letter.docx`);
    await recordFeedback(db, run.id, 'rejected', 'too junior');
    runIds.push(run.id);
  }
  return { userId: u.id, runIds };
}

beforeEach(async () => {
  ({ db, sqlite } = createTestDb());
  await seedUser(db);
  r2 = new FakeR2();
});

describe('See and correct my data', () => {
  it('lists every per-user table with a why on every item and never the key value', async () => {
    const { userId } = await seedFullUser('a@example.com');
    const data = await buildMyData(db, userId, 'privacy@example.com');
    const titles = data.groups.map((g) => g.title);
    expect(titles).toEqual(expect.arrayContaining(['Your account', 'Privacy acknowledgement', 'Profile: Default (default)', 'Job rules', 'Tailoring preferences (3)', 'Jobs looked at (2)', 'Keys']));
    for (const g of data.groups) for (const it of g.items) expect(it.why.length).toBeGreaterThan(5);
    expect(JSON.stringify(data)).not.toContain('"enc"');
    // Only the owner account sees the inbound-alert ledger.
    expect(titles).not.toContain('Job-alert emails');
    expect((await buildMyData(db, DEFAULT_USER_ID, 'x@example.com')).groups.map((g) => g.title)).toContain('Job-alert emails');
  });

  it('every table with a user_id column is shown', () => {
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%migrations%'").all() as { name: string }[]).map((t) => t.name);
    const withUser = tables.filter((t) => (sqlite.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'user_id'));
    // profiles → Profile groups, trigger_rules → Job rules, preferences, runs (with feedback), llm_credentials → Keys.
    expect(withUser.sort()).toEqual(['llm_credentials', 'preferences', 'profiles', 'runs', 'trigger_rules']);
  });

  it('corrects fields in place and removes items, only for the caller', async () => {
    const a = await seedFullUser('a@example.com');
    const b = await seedFullUser('b@example.com');
    const profileA = (await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, a.userId) }))!;
    const ok = (c: unknown) => applyCorrection(db, a.userId, correctionSchema.parse(c), r2);

    expect(await ok({ field: 'personal.phone', profileId: profileA.id, value: '027 123' })).toEqual({ ok: true });
    expect((await db.query.profiles.findFirst({ where: eq(schema.profiles.id, profileA.id) }))!.profileJson.personal.phone).toBe('027 123');
    expect(await ok({ field: 'reviewEmail', value: 'New@Example.com' })).toEqual({ ok: true });
    expect((await db.query.users.findFirst({ where: eq(schema.users.id, a.userId) }))!.reviewEmail).toBe('new@example.com');
    expect(correctionSchema.safeParse({ field: 'reviewEmail', value: 'not-an-email' }).success).toBe(false);

    // Another user's profile or run is not found.
    const profileB = (await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, b.userId) }))!;
    expect(await ok({ field: 'personal.phone', profileId: profileB.id, value: 'x' })).toMatchObject({ ok: false, status: 404 });
    expect(await ok({ remove: { kind: 'run', id: b.runIds[0] } })).toMatchObject({ ok: false, status: 404 });

    // Removing a run takes its feedback and documents; the feedback note stays as a preference, unlinked.
    expect(await ok({ remove: { kind: 'run', id: a.runIds[0] } })).toEqual({ ok: true });
    expect(await db.query.runs.findFirst({ where: eq(schema.runs.id, a.runIds[0]) })).toBeUndefined();
    expect(await db.select().from(schema.feedback).where(eq(schema.feedback.runId, a.runIds[0]))).toHaveLength(0);
    expect(r2.objects.has(`runs/${a.runIds[0]}/cv.docx`)).toBe(false);
    expect(r2.objects.has(`runs/${b.runIds[0]}/cv.docx`)).toBe(true);

    expect(await ok({ remove: { kind: 'llmKey' } })).toEqual({ ok: true });
    expect(await db.query.llmCredentials.findFirst({ where: eq(schema.llmCredentials.userId, a.userId) })).toBeUndefined();
    expect(await db.query.llmCredentials.findFirst({ where: eq(schema.llmCredentials.userId, b.userId) })).toBeTruthy();
  });
});

describe('Delete my account', () => {
  it('USER_TABLES covers every table that references users or runs', () => {
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%migrations%'").all() as { name: string }[]).map((t) => t.name);
    const covered = new Set<string>([...USER_TABLES, ...Object.keys(NOT_USER_TABLES)]);
    expect(tables.filter((t) => !covered.has(t))).toEqual([]);
    for (const t of tables) {
      const fks = sqlite.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string }[];
      if (fks.some((f) => f.table === 'users' || f.table === 'runs')) expect(USER_TABLES as readonly string[]).toContain(t);
    }
  });

  it('deletes every row and document for the user and nothing of anyone else', async () => {
    const a = await seedFullUser('a@example.com');
    const b = await seedFullUser('b@example.com');
    r2.objects.add(`runs/${a.runIds[1]}/extra.docx`);
    const r = await deleteAccountData(db, a.userId, r2);
    expect(r.deleted).toEqual({ feedback: 2, preferences: 3, runs: 2, profiles: 1, trigger_rules: 1, llm_credentials: 1, users: 1 });
    expect(r.documents).toBe(5);
    expect([...r2.objects].filter((k) => a.runIds.some((id) => k.startsWith(`runs/${id}/`)))).toEqual([]);
    expect(r2.objects.size).toBe(4); // b's documents untouched
    for (const t of [schema.profiles, schema.triggerRules, schema.preferences, schema.runs, schema.llmCredentials]) {
      expect(await db.select().from(t).where(eq(t.userId, a.userId))).toHaveLength(0);
      expect((await db.select().from(t).where(eq(t.userId, b.userId))).length).toBeGreaterThan(0);
    }
    expect(await db.query.users.findFirst({ where: eq(schema.users.id, a.userId) })).toBeUndefined();
  });

  it('refuses the owner account and requests without a person', async () => {
    expect(deletionBlockers(DEFAULT_USER_ID, 'owner@example.com')).toEqual(['owner']);
    expect(deletionBlockers(5, null)).toEqual(['no-identity']);
    expect(deletionBlockers(5, 'x@example.com')).toEqual([]);
    await expect(deleteAccountData(db, DEFAULT_USER_ID, r2)).rejects.toThrow(/owner/);
  });
});
