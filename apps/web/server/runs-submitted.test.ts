import { describe, expect, it } from 'vitest';
import { createRun, getRun, recordFeedback, setRunSubmitted } from './runs';
import { createTestDb, seedUser } from '@/server/test/db';

async function sentRun() {
  const { db } = createTestDb();
  await seedUser(db);
  const run = await createRun(db, { userId: 1, seekJobId: '123', jobTitle: 'Head of Product', jobUrl: 'https://www.seek.co.nz/job/123', jobText: 'x', jobTextSource: 'full-ad', status: 'sent' });
  return { db, run };
}

describe('setRunSubmitted', () => {
  it('ticks with a timestamp, is idempotent, and unticks', async () => {
    const { db, run } = await sentRun();
    expect(run.submittedAt).toBeNull();
    const at = new Date('2026-09-27T01:00:00Z');
    const ticked = await setRunSubmitted(db, run.id, true, at);
    expect(ticked?.submittedAt?.getTime()).toBe(at.getTime());
    const again = await setRunSubmitted(db, run.id, true, new Date('2026-09-28T01:00:00Z'));
    expect(again?.submittedAt?.getTime()).toBe(at.getTime());
    expect(again?.status).toBe('sent');
    const unticked = await setRunSubmitted(db, run.id, false);
    expect(unticked?.submittedAt).toBeNull();
    expect(unticked?.status).toBe('sent');
    expect(await setRunSubmitted(db, 999, true)).toBeNull();
  });

  it('the Applied action ticks Submitted; unticking an applied run returns it to sent', async () => {
    const { db, run } = await sentRun();
    await recordFeedback(db, run.id, 'applied');
    const applied = (await getRun(db, run.id))!;
    expect(applied.status).toBe('applied');
    expect(applied.submittedAt).not.toBeNull();
    const unticked = await setRunSubmitted(db, run.id, false);
    expect(unticked?.status).toBe('sent');
    expect(unticked?.submittedAt).toBeNull();
  });
});
