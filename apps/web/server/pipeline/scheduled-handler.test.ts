import { describe, it, expect } from 'vitest';
import { buildSeekJobPage } from '../../../../packages/engine/src/__fixtures__/seek-job-page';
import { createRun, getRun, recordFeedback } from '@/server/runs';
import type { CreateRunInput } from '@/server/runs';
import { PENDING_RETRY_AFTER_MS, RETRY_MARKER, runScheduledSweep } from './scheduled-handler';
import { FIXED_NOW_MS, USER, VALID_OUTPUT, fakeDeps, insertRunAt, scriptedGenerate, setupDb } from './test-support';

const PAGE = buildSeekJobPage();

function runInput(seekJobId: string, overrides: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    userId: USER,
    profileId: 1,
    seekJobId,
    jobTitle: 'Head of Modern Workplace',
    company: 'Kiwi Energy Group',
    jobUrl: `https://www.seek.co.nz/job/${seekJobId}`,
    jobText: PAGE,
    jobTextSource: 'full-ad',
    status: 'pending',
    ...overrides,
  };
}

describe('runScheduledSweep', () => {
  it('regenerates runs flagged by the feedback route, retries stale pending runs once, abandons those still pending after a retry, leaves fresh pending runs alone', async () => {
    const db = await setupDb();
    const stale = new Date(FIXED_NOW_MS - PENDING_RETRY_AFTER_MS - 60_000);
    const fresh = new Date(FIXED_NOW_MS - 60_000);

    const sentRun = await createRun(db, runInput('1', { status: 'sent', origin: 'live' }));
    await recordFeedback(db, sentRun.id, 'regenerate', 'shorter letter please'); // UI / email link → status 'regenerate'
    const staleRun = await insertRunAt(db, runInput('2'), stale);
    const exhausted = await insertRunAt(db, runInput('3', { error: RETRY_MARKER }), stale);
    const freshRun = await insertRunAt(db, runInput('4'), fresh);

    const { generate, calls } = scriptedGenerate([VALID_OUTPUT]);
    const { deps, sent } = fakeDeps({ db, generate });
    const summary = await runScheduledSweep(deps);

    expect(summary.regenerated).toEqual([{ runId: sentRun.id, status: 'sent' }]);
    expect(summary.retried).toEqual([{ runId: staleRun.id, status: 'sent' }]);
    expect(summary.abandoned).toEqual([exhausted.id]);

    expect((await getRun(db, sentRun.id))!.status).toBe('sent');
    expect(calls[0].system[1].text).toContain('shorter letter please');
    const retried = (await getRun(db, staleRun.id))!;
    expect(retried.status).toBe('sent');
    expect(retried.error).toBeNull();
    expect(retried.origin).toBe('live');
    const gaveUp = (await getRun(db, exhausted.id))!;
    expect(gaveUp.status).toBe('failed');
    expect(gaveUp.error).toContain('still pending');
    expect((await getRun(db, freshRun.id))!.status).toBe('pending');
    expect(sent).toHaveLength(2);
  });

  it('a retry that fails leaves the run failed (not pending), so it is not retried forever', async () => {
    const db = await setupDb();
    const stale = new Date(FIXED_NOW_MS - PENDING_RETRY_AFTER_MS - 60_000);
    const run = await insertRunAt(db, runInput('9'), stale);
    const { deps } = fakeDeps({ db, generate: scriptedGenerate([VALID_OUTPUT]).generate });
    deps.send = async () => {
      throw new Error('mailer down');
    };
    const summary = await runScheduledSweep(deps);
    expect(summary.retried).toEqual([{ runId: run.id, status: 'failed', reason: 'mailer down' }]);
    expect((await getRun(db, run.id))!.status).toBe('failed');
    expect((await runScheduledSweep(deps)).retried).toEqual([]);
  });

  it('is a no-op on an empty table', async () => {
    const db = await setupDb();
    const { deps, sent } = fakeDeps({ db });
    expect(await runScheduledSweep(deps)).toEqual({ regenerated: [], retried: [], abandoned: [] });
    expect(sent).toHaveLength(0);
  });
});
