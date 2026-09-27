import { describe, expect, it } from 'vitest';
import { dayLabel, dayOptions, filterByDay, nextSort, nzDayKey, sortRows, statsByDay, toRunRow, type RunRow } from './runs-table';
import type { Run } from '@/server/db/schema';

function row(p: Partial<RunRow> & { id: number }): RunRow {
  return { createdAt: p.id * 1000, day: '2026-09-26', jobTitle: `Job ${p.id}`, jobUrl: 'https://x.test', company: null, location: null, match: null, status: 'sent', origin: 'live', submitted: false, ...p };
}

describe('nzDayKey / dayLabel', () => {
  it('buckets by the Auckland calendar day, not UTC', () => {
    // 2026-09-25T12:30Z is 00:30 on the 26th in NZST (UTC+12; NZDT starts 27 Sept 2026).
    expect(nzDayKey(Date.parse('2026-09-25T12:30:00Z'))).toBe('2026-09-26');
    expect(nzDayKey(Date.parse('2026-09-25T11:30:00Z'))).toBe('2026-09-25');
    expect(dayLabel('2026-09-26')).toMatch(/26/);
    expect(dayLabel('2026-09-26')).toMatch(/Sat/);
  });
});

describe('toRunRow', () => {
  it('maps a run, treating origin "none" as empty and submittedAt as a boolean', () => {
    const r = toRunRow({ id: 3, createdAt: new Date('2026-09-26T01:00:00Z'), jobTitle: 'CTO', jobUrl: 'u', company: 'Acme', location: null, matchPercentage: 50, status: 'skipped', origin: 'none', submittedAt: null } as unknown as Run);
    expect(r).toMatchObject({ id: 3, day: '2026-09-26', match: 50, origin: null, submitted: false, company: 'Acme' });
    expect(toRunRow({ ...(r as unknown as Run), createdAt: new Date(0), submittedAt: new Date(), origin: 'live', matchPercentage: null } as unknown as Run).submitted).toBe(true);
  });
});

describe('sortRows', () => {
  const rows = [row({ id: 1, match: 40, jobTitle: 'beta' }), row({ id: 2, match: null, jobTitle: 'Alpha' }), row({ id: 3, match: 67, jobTitle: 'gamma' }), row({ id: 4, match: 40, jobTitle: '' })];
  it('sorts numbers both ways with empties last and newest-first ties', () => {
    expect(sortRows(rows, 'match', 'desc').map((r) => r.id)).toEqual([3, 4, 1, 2]);
    expect(sortRows(rows, 'match', 'asc').map((r) => r.id)).toEqual([4, 1, 3, 2]);
  });
  it('sorts text case-insensitively with empties last', () => {
    expect(sortRows(rows, 'jobTitle', 'asc').map((r) => r.id)).toEqual([2, 1, 3, 4]);
    expect(sortRows(rows, 'jobTitle', 'desc').map((r) => r.id)).toEqual([3, 1, 2, 4]);
  });
  it('sorts booleans (submitted first when descending) and does not mutate input', () => {
    const b = [row({ id: 1 }), row({ id: 2, submitted: true })];
    expect(sortRows(b, 'submitted', 'desc').map((r) => r.id)).toEqual([2, 1]);
    expect(b.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('nextSort', () => {
  it('flips on the same column; new numeric columns start desc, text columns asc', () => {
    expect(nextSort({ key: 'match', dir: 'desc' }, 'match')).toEqual({ key: 'match', dir: 'asc' });
    expect(nextSort({ key: 'match', dir: 'asc' }, 'createdAt')).toEqual({ key: 'createdAt', dir: 'desc' });
    expect(nextSort({ key: 'match', dir: 'asc' }, 'jobTitle', ['jobTitle'])).toEqual({ key: 'jobTitle', dir: 'asc' });
  });
});

describe('filterByDay / dayOptions', () => {
  const rows = [row({ id: 1, day: '2026-09-25' }), row({ id: 2, day: '2026-09-26' }), row({ id: 3, day: '2026-09-26' })];
  it('filters to one day or returns all', () => {
    expect(filterByDay(rows, '2026-09-26').map((r) => r.id)).toEqual([2, 3]);
    expect(filterByDay(rows, null)).toHaveLength(3);
  });
  it('lists days newest first with counts', () => {
    expect(dayOptions(rows).map((d) => [d.day, d.count])).toEqual([['2026-09-26', 2], ['2026-09-25', 1]]);
  });
});

describe('statsByDay', () => {
  it('counts status, submitted and origin per day and in total, averaging match over runs that have one', () => {
    const rows = [
      row({ id: 1, day: '2026-09-26', status: 'sent', origin: 'live', match: 60, submitted: true }),
      row({ id: 2, day: '2026-09-26', status: 'applied', origin: 'live-repaired', match: 50, submitted: true }),
      row({ id: 3, day: '2026-09-26', status: 'skipped', origin: null, match: 11 }),
      row({ id: 4, day: '2026-09-25', status: 'failed', origin: null, match: null }),
      row({ id: 5, day: '2026-09-25', status: 'regenerate', origin: 'fallback', match: 40 }),
    ];
    const { days, total } = statsByDay(rows);
    expect(days.map((d) => d.day)).toEqual(['2026-09-26', '2026-09-25']);
    expect(days[0]).toMatchObject({ runs: 3, emailed: 2, skipped: 1, failed: 0, submitted: 2, avgMatch: 40, topMatch: 60, live: 1, repaired: 1, fallback: 0 });
    expect(days[1]).toMatchObject({ runs: 2, emailed: 1, failed: 1, avgMatch: 40, topMatch: 40, fallback: 1 });
    expect(total).toMatchObject({ day: 'total', runs: 5, emailed: 3, skipped: 1, failed: 1, submitted: 2, avgMatch: 40, topMatch: 60 });
    expect(statsByDay([]).total.avgMatch).toBeNull();
  });
});
