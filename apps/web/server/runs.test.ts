import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { UserProfile } from '@applyforme/engine';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { createTestDb, seedUser } from '@/server/test/db';
import {
  createRun,
  findProcessedEmail,
  findRunBySeekJobId,
  getOrCreateDefaultProfile,
  getRun,
  getTriggerRules,
  listPreferences,
  listRuns,
  recordFeedback,
  recordProcessedEmail,
  saveTriggerRules,
  updateRun,
  type CreateRunInput,
} from './runs';

const USER = schema.DEFAULT_USER_ID;

const PROFILE: UserProfile = {
  id: 'p1',
  personal: { name: 'Sam', email: 'sam@example.com', phone: '', address: 'Wellington', linkedin: '', nationality: 'NZ', years_experience: 12 },
  executive_summary: 'Modern Workplace lead.',
  core_competencies: ['M365', 'Intune'],
  career_history: [],
  certifications_and_training: [],
};

function runInput(seekJobId: string, overrides: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    userId: USER,
    seekJobId,
    jobTitle: `Job ${seekJobId}`,
    company: 'Acme',
    location: 'Wellington',
    salaryText: '$140k–$160k',
    jobUrl: `https://www.seek.co.nz/job/${seekJobId}`,
    jobText: 'Lead the Modern Workplace team.',
    jobTextSource: 'alert-snippet',
    ...overrides,
  };
}

let db: Db;
beforeEach(async () => {
  db = createTestDb().db;
  await seedUser(db);
});

describe('processed emails', () => {
  it('records a row and finds it by message id; unknown ids are null', async () => {
    expect(await findProcessedEmail(db, 'm1@seek')).toBeNull();
    const row = await recordProcessedEmail(db, { messageId: 'm1@seek', source: 'seek', subject: '3 new jobs', jobsFound: 3, status: 'processed' });
    expect(row.id).toBeGreaterThan(0);
    expect(row.jobsFound).toBe(3);
    expect(row.error).toBeNull();
    expect(await findProcessedEmail(db, 'm1@seek')).toEqual(row);
  });

  it('upserts on message id — a retry after failure updates the same row', async () => {
    const first = await recordProcessedEmail(db, { messageId: 'm2@seek', source: 'seek', status: 'failed', error: 'boom' });
    const second = await recordProcessedEmail(db, { messageId: 'm2@seek', source: 'seek', status: 'processed', jobsFound: 1 });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('processed');
    expect(second.error).toBeNull();
    expect(await db.select().from(schema.processedEmails)).toHaveLength(1);
  });
});

describe('runs', () => {
  it('createRun → getRun / findRunBySeekJobId round-trip with defaults applied', async () => {
    const created = await createRun(db, runInput('111'));
    expect(created.status).toBe('pending');
    expect(created.origin).toBeNull();
    expect(created.createdAt).toBeInstanceOf(Date);

    expect(await getRun(db, created.id)).toEqual(created);
    expect(await findRunBySeekJobId(db, USER, '111')).toEqual(created);
    expect(await findRunBySeekJobId(db, USER, '999')).toBeNull();
    expect(await findRunBySeekJobId(db, 2, '111')).toBeNull();
    expect(await getRun(db, 12345)).toBeNull();
  });

  it('enforces one run per (user, seek job)', async () => {
    await createRun(db, runInput('222'));
    await expect(createRun(db, runInput('222'))).rejects.toThrow();
  });

  it('links a run to its profile and processed email', async () => {
    const [profile] = await db.insert(schema.profiles).values({ userId: USER, name: 'Default', profileJson: PROFILE, isDefault: true }).returning();
    const email = await recordProcessedEmail(db, { messageId: 'm3@seek', source: 'seek', status: 'processed' });
    const run = await createRun(db, runInput('333', { profileId: profile.id, processedEmailId: email.id }));
    expect(run.profileId).toBe(profile.id);
    expect(run.processedEmailId).toBe(email.id);
    await expect(createRun(db, runInput('334', { profileId: 999 }))).rejects.toThrow(); // FK enforced
  });

  it('updateRun patches fields, bumps updated_at, and returns null for a missing run', async () => {
    const created = await createRun(db, runInput('444'));
    const updated = await updateRun(db, created.id, {
      status: 'sent',
      matchPercentage: 82,
      origin: 'live',
      cvKey: 'runs/1/cv.docx',
      emailMessageId: '<sent@example>',
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('sent');
    expect(updated!.matchPercentage).toBe(82);
    expect(updated!.origin).toBe('live');
    expect(updated!.cvKey).toBe('runs/1/cv.docx');
    expect(updated!.jobTitle).toBe('Job 444');
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    expect(await updateRun(db, 12345, { status: 'sent' })).toBeNull();
  });

  it('listRuns returns the user’s runs newest first, capped by limit', async () => {
    const a = await createRun(db, runInput('501'));
    const b = await createRun(db, runInput('502'));
    const c = await createRun(db, runInput('503'));
    await db.insert(schema.users).values({ id: 2, name: 'Other', email: 'other@example.com' });
    await createRun(db, runInput('504', { userId: 2 }));

    const all = await listRuns(db, USER);
    expect(all.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    expect(await listRuns(db, USER, { limit: 2 })).toHaveLength(2);
    expect((await listRuns(db, 2)).map((r) => r.seekJobId)).toEqual(['504']);
  });
});

describe('recordFeedback', () => {
  it('appends feedback and flips status for applied/rejected/regenerate', async () => {
    const run = await createRun(db, runInput('601', { status: 'sent' }));

    const applied = await recordFeedback(db, run.id, 'applied');
    expect(applied.run.status).toBe('applied');
    expect(applied.preferenceId).toBeNull();

    const rejected = await recordFeedback(db, run.id, 'rejected');
    expect(rejected.run.status).toBe('rejected');

    const regenerate = await recordFeedback(db, run.id, 'regenerate');
    expect(regenerate.run.status).toBe('regenerate');

    const log = await db.select().from(schema.feedback).where(eq(schema.feedback.runId, run.id));
    expect(log.map((f) => f.action)).toEqual(['applied', 'rejected', 'regenerate']);
  });

  it('thumbs-up is a signal only — status unchanged', async () => {
    const run = await createRun(db, runInput('602', { status: 'sent' }));
    const result = await recordFeedback(db, run.id, 'thumbs-up');
    expect(result.run.status).toBe('sent');
    expect((await getRun(db, run.id))!.status).toBe('sent');
  });

  it('captures a reason as a feedback-sourced preference linked to the run', async () => {
    const run = await createRun(db, runInput('603', { status: 'sent' }));
    const result = await recordFeedback(db, run.id, 'rejected', '  Too much buzzword, tone it down.  ');
    expect(result.preferenceId).not.toBeNull();

    const prefs = await listPreferences(db, USER);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ kind: 'note', source: 'feedback', runId: run.id, text: 'Too much buzzword, tone it down.' });

    const fb = await db.query.feedback.findFirst({ where: eq(schema.feedback.id, result.feedbackId) });
    expect(fb!.reason).toBe('Too much buzzword, tone it down.');
  });

  it('a blank reason records no preference', async () => {
    const run = await createRun(db, runInput('604', { status: 'sent' }));
    const result = await recordFeedback(db, run.id, 'applied', '   ');
    expect(result.preferenceId).toBeNull();
    expect(await listPreferences(db, USER)).toHaveLength(0);
  });

  it('throws for an unknown run', async () => {
    await expect(recordFeedback(db, 999, 'applied')).rejects.toThrow('not found');
  });
});

describe('getOrCreateDefaultProfile', () => {
  it('returns null when the user has no profiles', async () => {
    expect(await getOrCreateDefaultProfile(db, USER)).toBeNull();
  });

  it('returns the flagged default with the typed profile JSON', async () => {
    await db.insert(schema.profiles).values({ userId: USER, name: 'Alt', profileJson: { ...PROFILE, id: 'alt' } });
    await db.insert(schema.profiles).values({ userId: USER, name: 'Main', profileJson: PROFILE, isDefault: true });
    const found = await getOrCreateDefaultProfile(db, USER);
    expect(found!.name).toBe('Main');
    expect(found!.profileJson.core_competencies).toEqual(['M365', 'Intune']);
  });

  it('promotes the oldest profile when none is flagged', async () => {
    await db.insert(schema.profiles).values({ userId: USER, name: 'First', profileJson: PROFILE });
    await db.insert(schema.profiles).values({ userId: USER, name: 'Second', profileJson: PROFILE });
    const promoted = await getOrCreateDefaultProfile(db, USER);
    expect(promoted!.name).toBe('First');
    expect(promoted!.isDefault).toBe(true);

    const rows = await db.select().from(schema.profiles).where(eq(schema.profiles.isDefault, true));
    expect(rows).toHaveLength(1);
    expect((await getOrCreateDefaultProfile(db, USER))!.id).toBe(promoted!.id);
  });
});

describe('trigger rules + preferences', () => {
  it('getTriggerRules is null until saved; saveTriggerRules upserts', async () => {
    expect(await getTriggerRules(db, USER)).toBeNull();
    await saveTriggerRules(db, USER, JSON.stringify({ minMatch: 60 }));
    await saveTriggerRules(db, USER, JSON.stringify({ minMatch: 70 }));
    const rules = await getTriggerRules(db, USER);
    expect(JSON.parse(rules!.rulesJson)).toEqual({ minMatch: 70 });
    expect(await db.select().from(schema.triggerRules)).toHaveLength(1);
  });

  it('listPreferences returns only the user’s rows, oldest first', async () => {
    await db.insert(schema.users).values({ id: 2, name: 'Other', email: 'other@example.com' });
    await db.insert(schema.preferences).values([
      { userId: USER, kind: 'tone', text: 'Direct, no fluff.' },
      { userId: 2, kind: 'avoid', text: 'Not mine.' },
      { userId: USER, kind: 'emphasise', text: 'M365 migrations.' },
    ]);
    const prefs = await listPreferences(db, USER);
    expect(prefs.map((p) => p.kind)).toEqual(['tone', 'emphasise']);
    expect(prefs.every((p) => p.source === 'manual')).toBe(true);
  });
});
