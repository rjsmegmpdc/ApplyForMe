/**
 * Pure logic behind the Runs page's stats and table: NZ-day bucketing,
 * per-day stats (status counts, match, origin), column sorting and the day
 * filter. No React, no I/O — the client component only holds state.
 */
import type { Run } from '@/server/db/schema';
import { NZ_TZ } from './format';

export interface RunRow {
  id: number;
  /** Epoch ms. */
  createdAt: number;
  /** NZ calendar day, `YYYY-MM-DD`. */
  day: string;
  jobTitle: string;
  jobUrl: string;
  company: string | null;
  location: string | null;
  match: number | null;
  status: Run['status'];
  origin: string | null;
  submitted: boolean;
}

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: NZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** `YYYY-MM-DD` of the instant in Pacific/Auckland. */
export function nzDayKey(date: Date | number): string {
  return dayKeyFmt.format(new Date(date));
}

/** "Sat, 26 Sept 2026" for a `YYYY-MM-DD` key (formatted as a calendar date, no zone shift). */
export function dayLabel(day: string): string {
  return dayLabelFmt.format(new Date(`${day}T00:00:00Z`));
}

export function toRunRow(run: Run): RunRow {
  const created = run.createdAt instanceof Date ? run.createdAt.getTime() : Number(run.createdAt);
  return {
    id: run.id,
    createdAt: created,
    day: nzDayKey(created),
    jobTitle: run.jobTitle,
    jobUrl: run.jobUrl,
    company: run.company ?? null,
    location: run.location ?? null,
    match: run.matchPercentage ?? null,
    status: run.status,
    origin: run.origin && run.origin !== 'none' ? run.origin : null,
    submitted: run.submittedAt != null,
  };
}

/* ------------------------------------------------------------------------ */
/* Sorting                                                                   */
/* ------------------------------------------------------------------------ */

export type SortDir = 'asc' | 'desc';
export type RunSortKey = 'createdAt' | 'jobTitle' | 'company' | 'location' | 'match' | 'status' | 'origin' | 'submitted';

function compareValues(a: string | number | boolean | null, b: string | number | boolean | null): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'en-NZ', { sensitivity: 'base', numeric: true });
  return Number(a) - Number(b);
}

/**
 * Stable sort by one key. Empty values (null / '') always sort last in either
 * direction, so "sort by match" never opens with a column of dashes. Ties
 * fall back to newest first.
 */
export function sortRows<T extends Record<K, string | number | boolean | null> & { createdAt?: number }, K extends keyof T>(
  rows: readonly T[],
  key: K,
  dir: SortDir
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row[key];
      const b = y.row[key];
      const aEmpty = a === null || a === '';
      const bEmpty = b === null || b === '';
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      const c = aEmpty ? 0 : compareValues(a, b) * sign;
      if (c !== 0) return c;
      const t = (y.row.createdAt ?? 0) - (x.row.createdAt ?? 0);
      return t !== 0 ? t : x.index - y.index;
    })
    .map((x) => x.row);
}

/** Clicking a header: same column flips direction; a new column starts descending (biggest / newest first) except text columns. */
export function nextSort<K extends string>(current: { key: K; dir: SortDir }, clicked: K, textKeys: readonly K[] = []): { key: K; dir: SortDir } {
  if (current.key === clicked) return { key: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key: clicked, dir: textKeys.includes(clicked) ? 'asc' : 'desc' };
}

/* ------------------------------------------------------------------------ */
/* Filtering                                                                 */
/* ------------------------------------------------------------------------ */

/** `day` null = all days. */
export function filterByDay<T extends { day: string }>(rows: readonly T[], day: string | null): T[] {
  return day ? rows.filter((r) => r.day === day) : [...rows];
}

/** Distinct days, newest first, with run counts — the day filter's options. */
export function dayOptions(rows: readonly RunRow[]): { day: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.day, (counts.get(r.day) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, count]) => ({ day, label: dayLabel(day), count }));
}

/* ------------------------------------------------------------------------ */
/* Per-day stats                                                             */
/* ------------------------------------------------------------------------ */

/** Statuses meaning a pack was emailed (later feedback moves 'sent' on to these). */
const EMAILED: ReadonlySet<Run['status']> = new Set(['sent', 'applied', 'rejected', 'regenerate']);

export interface DayStats {
  day: string;
  runs: number;
  /** Packs emailed (sent + applied + rejected + regenerate). */
  emailed: number;
  skipped: number;
  failed: number;
  pending: number;
  submitted: number;
  /** Mean match % over runs that have one; null when none do. Rounded. */
  avgMatch: number | null;
  topMatch: number | null;
  /** Origin of emailed packs. */
  live: number;
  repaired: number;
  fallback: number;
}

export type DayStatsKey = Exclude<keyof DayStats, never>;

function emptyStats(day: string): DayStats {
  return { day, runs: 0, emailed: 0, skipped: 0, failed: 0, pending: 0, submitted: 0, avgMatch: null, topMatch: null, live: 0, repaired: 0, fallback: 0 };
}

function accumulate(rows: readonly RunRow[], day: string): DayStats {
  const s = emptyStats(day);
  let matchSum = 0;
  let matchN = 0;
  for (const r of rows) {
    s.runs += 1;
    if (EMAILED.has(r.status)) s.emailed += 1;
    else if (r.status === 'skipped') s.skipped += 1;
    else if (r.status === 'failed') s.failed += 1;
    else if (r.status === 'pending') s.pending += 1;
    if (r.submitted) s.submitted += 1;
    if (r.match != null) {
      matchSum += r.match;
      matchN += 1;
      s.topMatch = s.topMatch == null ? r.match : Math.max(s.topMatch, r.match);
    }
    if (r.origin === 'live') s.live += 1;
    else if (r.origin === 'live-repaired') s.repaired += 1;
    else if (r.origin === 'fallback') s.fallback += 1;
  }
  s.avgMatch = matchN ? Math.round(matchSum / matchN) : null;
  return s;
}

/** One row per NZ day (newest first) plus a totals row. */
export function statsByDay(rows: readonly RunRow[]): { days: DayStats[]; total: DayStats } {
  const byDay = new Map<string, RunRow[]>();
  for (const r of rows) {
    const list = byDay.get(r.day);
    if (list) list.push(r);
    else byDay.set(r.day, [r]);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => accumulate(list, day));
  return { days, total: accumulate(rows, 'total') };
}
