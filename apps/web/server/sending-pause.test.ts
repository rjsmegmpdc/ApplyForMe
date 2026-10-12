import { describe, expect, it } from 'vitest';
import { countHeldRuns, getRun, isSendingPaused, setSendingPaused, settleHeldRuns } from '@/server/runs';
import { schema } from '@/server/db';
import { processListing, processRegenerate, resendRun } from '@/server/pipeline/run-job';
import { runScheduledSweep } from '@/server/pipeline/scheduled-handler';
import { fakeDeps, scriptedGenerate, setupDb, USER, VALID_OUTPUT } from '@/server/pipeline/test-support';
import { DEFAULT_TRIGGER_RULES } from '@applyforme/engine';
import { saveTriggerRules } from '@/server/runs';

const LISTING = {
  title: 'Head of Digital',
  company: 'Acme NZ',
  location: 'Auckland',
  salary: '',
  description: 'Lead digital, cloud, Microsoft 365 and AI adoption across the organisation.',
  url: 'https://www.seek.co.nz/job/90000001',
};

async function db0() {
  const db = await setupDb();
  await saveTriggerRules(db, USER, JSON.stringify({ ...DEFAULT_TRIGGER_RULES, minMatchPercentage: 0 }));
  return db;
}

describe('sending pause', () => {
  it('toggles and keeps the original pause time', async () => {
    const db = await db0();
    expect(await isSendingPaused(db, USER)).toBe(false);
    const t1 = await setSendingPaused(db, USER, true, new Date('2026-10-12T00:00:00Z'));
    const t2 = await setSendingPaused(db, USER, true, new Date('2026-10-13T00:00:00Z'));
    expect(t2?.getTime()).toBe(t1?.getTime());
    expect(await setSendingPaused(db, USER, false)).toBeNull();
  });

  it('paused: a matching job is analysed and held — no model call, no email', async () => {
    const db = await db0();
    await setSendingPaused(db, USER, true);
    const { generate, calls } = scriptedGenerate([VALID_OUTPUT]);
    const { deps, sent, generateForCalls } = fakeDeps({ db, generate });
    const r = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(r).toMatchObject({ status: 'held', reason: 'sending paused' });
    const run = (await getRun(db, r.runId))!;
    expect(run.status).toBe('held');
    expect(run.analysisJson).toBeTruthy();
    expect(calls).toHaveLength(0);
    expect(generateForCalls).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(await countHeldRuns(db, USER)).toBe(1);
    // seen again while still paused: a duplicate, still held
    expect((await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING })).reason).toBe('duplicate');
  });

  it('paused: regenerate, resend and the sweep send nothing and leave runs untouched', async () => {
    const db = await db0();
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    const first = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(first.status).toBe('sent');
    await db.update(schema.runs).set({ status: 'regenerate' });
    await setSendingPaused(db, USER, true);

    expect(await processRegenerate(deps, first.runId)).toMatchObject({ status: 'regenerate', reason: 'sending paused' });
    expect(await resendRun(deps, first.runId)).toMatchObject({ status: 'failed' });
    const sweep = await runScheduledSweep(deps);
    expect(sweep).toMatchObject({ regenerated: [], retried: [], abandoned: [], pausedSkipped: 1 });
    expect((await getRun(db, first.runId))!.status).toBe('regenerate');
    expect(sent).toHaveLength(1);

    await setSendingPaused(db, USER, false);
    expect((await runScheduledSweep(deps)).regenerated).toHaveLength(1);
    expect(sent).toHaveLength(2);
  });

  it('after resuming: held jobs are released to the sweep, or discarded', async () => {
    const db = await db0();
    await setSendingPaused(db, USER, true);
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    const a = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    const b = await processListing(deps, { userId: USER, processedEmailId: null, listing: { ...LISTING, url: 'https://www.seek.co.nz/job/90000002' } });
    await setSendingPaused(db, USER, false);

    expect(await settleHeldRuns(db, USER, 'release')).toBe(2);
    expect((await getRun(db, a.runId))!.status).toBe('regenerate');
    await runScheduledSweep(deps);
    expect(sent).toHaveLength(2);
    expect((await getRun(db, b.runId))!.status).toBe('sent');

    await setSendingPaused(db, USER, true);
    const c = await processListing(deps, { userId: USER, processedEmailId: null, listing: { ...LISTING, url: 'https://www.seek.co.nz/job/90000003' } });
    await setSendingPaused(db, USER, false);
    expect(await settleHeldRuns(db, USER, 'discard')).toBe(1);
    expect((await getRun(db, c.runId))!.status).toBe('skipped');
  });

  it('a held job forwarded again after resuming is sent', async () => {
    const db = await db0();
    await setSendingPaused(db, USER, true);
    const { deps, sent } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    const held = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    await setSendingPaused(db, USER, false);
    const again = await processListing(deps, { userId: USER, processedEmailId: null, listing: LISTING });
    expect(again).toMatchObject({ runId: held.runId, status: 'sent' });
    expect(sent).toHaveLength(1);
  });
});
