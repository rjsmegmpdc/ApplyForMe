import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';
import { createTestDb, seedUser } from '@/server/test/db';
import { checkDailyBudget, countTailoredToday, DAILY_TAILOR_BUDGET, nzDayBoundsUtc, nzLocalDate } from './budget';
import type { Run } from '@/server/db/schema';

const USER = schema.DEFAULT_USER_ID;

async function insertRun(db: Db, seekJobId: string, origin: Run['origin'], createdAt: Date): Promise<void> {
  await db.insert(schema.runs).values({
    userId: USER,
    seekJobId,
    jobTitle: 'Job',
    jobUrl: `https://www.seek.co.nz/job/${seekJobId}`,
    jobText: 'text',
    jobTextSource: 'alert-snippet',
    origin,
    status: 'sent',
    createdAt,
    updatedAt: createdAt,
  });
}

describe('NZ day bounds', () => {
  it('NZST (UTC+12): 2026-06-15 runs from 2026-06-14T12:00Z to 2026-06-15T12:00Z', () => {
    expect(nzDayBoundsUtc('2026-06-15')).toEqual({ startMs: Date.UTC(2026, 5, 14, 12), endMs: Date.UTC(2026, 5, 15, 12) });
  });

  it('NZDT (UTC+13): 2026-01-10 runs from 2026-01-09T11:00Z to 2026-01-10T11:00Z', () => {
    expect(nzDayBoundsUtc('2026-01-10')).toEqual({ startMs: Date.UTC(2026, 0, 9, 11), endMs: Date.UTC(2026, 0, 10, 11) });
  });

  it('the day DST starts (last Sunday of September 2026 = 27th) is 23 hours long', () => {
    const { startMs, endMs } = nzDayBoundsUtc('2026-09-27');
    expect(startMs).toBe(Date.UTC(2026, 8, 26, 12));
    expect(endMs).toBe(Date.UTC(2026, 8, 27, 11));
  });

  it('a timestamp is mapped to its NZ local date first', () => {
    // 2026-09-12T22:30Z is 10:30 on the 13th in Auckland.
    expect(nzLocalDate(Date.UTC(2026, 8, 12, 22, 30))).toBe('2026-09-13');
    expect(nzDayBoundsUtc('2026-09-12T22:30:00.000Z')).toEqual(nzDayBoundsUtc('2026-09-13'));
  });

  it('rejects garbage', () => {
    expect(() => nzDayBoundsUtc('yesterday')).toThrow();
  });
});

describe('daily tailoring budget', () => {
  let db: Db;
  beforeEach(async () => {
    db = createTestDb().db;
    await seedUser(db);
  });

  it('counts only live / live-repaired runs created on the NZ day', async () => {
    const inDay = new Date(Date.UTC(2026, 8, 13, 2)); // 14:00 NZST on the 13th
    const dayBefore = new Date(Date.UTC(2026, 8, 12, 11, 59)); // 23:59 NZST on the 12th
    await insertRun(db, '1', 'live', inDay);
    await insertRun(db, '2', 'live-repaired', inDay);
    await insertRun(db, '3', 'fallback', inDay);
    await insertRun(db, '4', 'none', inDay);
    await insertRun(db, '5', null, inDay);
    await insertRun(db, '6', 'live', dayBefore);

    expect(await countTailoredToday(db, USER, '2026-09-13')).toBe(2);
    expect(await countTailoredToday(db, USER, '2026-09-12')).toBe(1);
    const check = await checkDailyBudget(db, USER, '2026-09-13');
    expect(check).toEqual({ allowed: true, used: 2, remaining: DAILY_TAILOR_BUDGET - 2 });
  });

  it('refuses once the budget is reached', async () => {
    const when = new Date(Date.UTC(2026, 8, 13, 2));
    for (let i = 0; i < DAILY_TAILOR_BUDGET; i++) await insertRun(db, `job-${i}`, 'live', when);
    const check = await checkDailyBudget(db, USER, '2026-09-13');
    expect(check.allowed).toBe(false);
    expect(check.remaining).toBe(0);
    expect(check.used).toBe(DAILY_TAILOR_BUDGET);
  });
});
