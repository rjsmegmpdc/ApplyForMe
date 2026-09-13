/**
 * Daily tailoring budget (pattern from AICoach's economy.ts). Counts the
 * runs that actually spent LLM tokens today — origin 'live' or
 * 'live-repaired' — per user, per New Zealand local day, and refuses
 * further live tailoring once DAILY_TAILOR_BUDGET is reached. The pipeline
 * then still sends a pack, built deterministically and marked as such.
 *
 * "Today" is injected as an ISO string (a date `YYYY-MM-DD` taken as an NZ
 * local date, or a full timestamp whose NZ local date is used) so nothing
 * here reads the clock. The day's UTC bounds come from Intl with the
 * `Pacific/Auckland` zone — DST is handled by resolving the zone offset at
 * the boundary itself, no timezone library needed.
 */
import { and, gte, inArray, lt, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';

export const DAILY_TAILOR_BUDGET = 25;
export const NZ_TIME_ZONE = 'Pacific/Auckland';

const LIVE_ORIGINS = ['live', 'live-repaired'] as const;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NZ_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock components of `ms` in the NZ zone. */
function nzWallClock(ms: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const get = (type: string): number => Number(partsFormatter.formatToParts(new Date(ms)).find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Milliseconds the NZ zone is ahead of UTC at instant `ms` (43,200,000 or 46,800,000). */
function nzOffsetMs(ms: number): number {
  const w = nzWallClock(ms);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The NZ-local calendar date of an instant, as `YYYY-MM-DD`. */
export function nzLocalDate(ms: number): string {
  const w = nzWallClock(ms);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** UTC instant (ms) of local midnight starting the given NZ date — two passes so a DST change on that night resolves correctly. */
function nzMidnightUtcMs(year: number, month: number, day: number): number {
  const naive = Date.UTC(year, month - 1, day);
  let guess = naive - nzOffsetMs(naive);
  guess = naive - nzOffsetMs(guess);
  return guess;
}

/**
 * `[start, end)` in UTC ms of the NZ local day named by `todayIso`. A bare
 * date is used as-is; a timestamp is first mapped to its NZ local date.
 */
export function nzDayBoundsUtc(todayIso: string): { startMs: number; endMs: number } {
  const dateOnly = todayIso.includes('T') ? nzLocalDate(Date.parse(todayIso)) : todayIso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!m) throw new Error(`todayIso must be YYYY-MM-DD or an ISO timestamp, got ${JSON.stringify(todayIso)}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const startMs = nzMidnightUtcMs(year, month, day);
  const next = new Date(Date.UTC(year, month - 1, day + 1)); // Date.UTC normalises month/year rollover
  const endMs = nzMidnightUtcMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { startMs, endMs };
}

/** Runs that spent LLM tokens (origin live / live-repaired) for this user on the NZ local day. */
export async function countTailoredToday(db: Db, userId: number, todayIso: string): Promise<number> {
  const { startMs, endMs } = nzDayBoundsUtc(todayIso);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.userId, userId),
        inArray(schema.runs.origin, [...LIVE_ORIGINS]),
        gte(schema.runs.createdAt, new Date(startMs)),
        lt(schema.runs.createdAt, new Date(endMs))
      )
    );
  return Number(rows[0]?.count ?? 0);
}

export interface BudgetCheck {
  allowed: boolean;
  used: number;
  remaining: number;
}

export async function checkDailyBudget(db: Db, userId: number, todayIso: string): Promise<BudgetCheck> {
  const used = await countTailoredToday(db, userId, todayIso);
  const remaining = Math.max(0, DAILY_TAILOR_BUDGET - used);
  return { allowed: used < DAILY_TAILOR_BUDGET, used, remaining };
}
