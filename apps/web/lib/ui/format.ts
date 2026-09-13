import type { RunStatus } from '@/server/db/schema';

/** Every timestamp in the console is shown in Matt's local zone, regardless of where the Worker ran. */
export const NZ_TZ = 'Pacific/Auckland';

const dateTimeFmt = new Intl.DateTimeFormat('en-NZ', {
  timeZone: NZ_TZ,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fullFmt = new Intl.DateTimeFormat('en-NZ', {
  timeZone: NZ_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatNz(date: Date | string | number): string {
  return dateTimeFmt.format(new Date(date));
}

export function formatNzFull(date: Date | string | number): string {
  return fullFmt.format(new Date(date));
}

export type Tone = 'ok' | 'warn' | 'accent' | 'muted' | 'danger';

export const STATUS_TONE: Record<RunStatus, Tone> = {
  pending: 'muted',
  skipped: 'muted',
  sent: 'accent',
  failed: 'danger',
  applied: 'ok',
  rejected: 'warn',
  regenerate: 'warn',
};

export const ORIGIN_TONE: Record<string, Tone> = {
  live: 'ok',
  'live-repaired': 'warn',
  fallback: 'warn',
  none: 'muted',
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
