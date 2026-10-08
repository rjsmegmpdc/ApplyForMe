/**
 * Salary in the match score. Every job gets a salary band in NZD per year:
 *
 *  1. ADVERTISED — read from the listing's salary field, else from a salary
 *     line in the ad text. AUD / USD / GBP are converted to NZD (an "$" on an
 *     Australian job is taken as AUD); hourly and day rates are annualised
 *     (HOURS_PER_YEAR, DAYS_PER_YEAR) and flagged as contract rates.
 *  2. ESTIMATED — no salary given: the market band for similar roles
 *     (market-bands.ts), NZ or AU by the job's location, clearly labelled
 *     "not specified — estimated".
 *
 * The band is scored against the profile's target (salaryFit) and blended
 * into the skills match: blended = skills × (1 − w) + fit × w, where w is the
 * profile's weight for an advertised salary and half of it for an estimate
 * (an estimate is a guess about the role, not a fact about it).
 *
 * Pure and deterministic.
 */
import type { AnalysisResult } from '../analyze/job-analyzer';
import type { SalaryTarget } from '../types';
import { AUD_TO_NZD, GBP_TO_NZD, USD_TO_NZD, estimateMarketBand, isAustralianLocation } from './market-bands';

export const DEFAULT_SALARY_WEIGHT = 20;
export const MAX_SALARY_WEIGHT = 50;
/** Contract hours per year used to annualise an hourly rate (40 h × 47 weeks). */
export const HOURS_PER_YEAR = 1880;
/** Contract days per year used to annualise a day rate. */
export const DAYS_PER_YEAR = 220;

export type SalaryCurrency = 'NZD' | 'AUD' | 'USD' | 'GBP';
export type SalaryPeriod = 'year' | 'hour' | 'day';

export interface JobSalary {
  source: 'advertised' | 'estimated';
  /** NZD per year. Both set for estimates; one may be null for "up to" / "from" adverts. */
  minNzd: number | null;
  maxNzd: number | null;
  /** Advertised: the text it was read from. Estimated: null. */
  advertisedText: string | null;
  currency: SalaryCurrency;
  period: SalaryPeriod;
  /** Estimated: which band was used and for which market. */
  band?: { id: string; label: string; market: 'NZ' | 'AU' };
  /** One-line human explanation for the email / run page. */
  basis: string;
}

export interface SalaryAssessment extends JobSalary {
  target: { min: number; max: number };
  /** 0–100: how close the job's band is to the target. */
  fit: number;
  position: 'within' | 'overlaps' | 'below' | 'above';
  /** NZD between the band and the target range (0 when they touch). */
  gapNzd: number;
  /** Effective weight applied, 0–50 (percent). */
  weight: number;
  /** The analyser's requirement match before salary was blended in. */
  skillsMatch: number;
  /** skillsMatch blended with fit — what becomes matchPercentage. */
  blendedMatch: number;
}

/* ------------------------------------------------------------------------ */
/* Reading an advertised salary                                              */
/* ------------------------------------------------------------------------ */

const SALARY_LINE_RE = /salary|remuneration|package|base|compensation|\bpay\b|per\s+annum|\bp\.?\s?a\b|\$\s?\d|\d\s?k\b|\b(?:nzd|aud|usd)\b|per\s+(?:hour|day)|hourly|day\s+rate/i;
const HOURLY_RE = /\bper\s+hour\b|\/\s*(?:hr|hour)\b|\bp\.?\s?h\b|\bhourly\b|\ban\s+hour\b/i;
const DAILY_RE = /\bper\s+day\b|\/\s*day\b|\bday\s+rate\b|\bdaily\s+rate\b|\bp\.?\s?d\b/i;

function detectCurrency(text: string, location: string): SalaryCurrency {
  if (/\b(?:aud|a\$|au\$)|\bau\s*\$/i.test(text)) return 'AUD';
  if (/\b(?:usd|us\$)/i.test(text)) return 'USD';
  if (/\bgbp\b|£/i.test(text)) return 'GBP';
  if (/\bnzd\b|nz\$/i.test(text)) return 'NZD';
  return isAustralianLocation(location) ? 'AUD' : 'NZD';
}

function toNzd(n: number, c: SalaryCurrency): number {
  const rate = c === 'AUD' ? AUD_TO_NZD : c === 'USD' ? USD_TO_NZD : c === 'GBP' ? GBP_TO_NZD : 1;
  return Math.round((n * rate) / 1000) * 1000;
}

/** Numbers in a salary string: "150-180k", "$150,000 – $180,000", "$95/hr", "$1,100 per day". */
function figures(text: string): { value: number; hasK: boolean; plus: boolean }[] {
  const out: { value: number; hasK: boolean; plus: boolean }[] = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|m)?(?![\p{L}\p{N}])/giu;
  for (const m of text.matchAll(re)) {
    const base = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
    const unit = m[3]?.toLowerCase();
    const after = text.slice(m.index! + m[0].length).trimStart();
    out.push({ value: unit === 'm' ? base * 1_000_000 : base, hasK: unit === 'k', plus: after.startsWith('+') });
  }
  return out;
}

interface Parsed {
  min: number | null;
  max: number | null;
  period: SalaryPeriod;
}

/** Parse one salary string into a per-period range in its own currency; null when it has no usable figure. */
export function parseSalaryText(text: string): Parsed | null {
  const period: SalaryPeriod = HOURLY_RE.test(text) ? 'hour' : DAILY_RE.test(text) ? 'day' : 'year';
  const [lo, hi] = period === 'hour' ? [20, 500] : period === 'day' ? [200, 4000] : [40_000, 1_500_000];
  const raw = figures(text);
  const anyK = raw.some((r) => r.hasK);
  const vals = raw
    .map((r) => ({ value: period === 'year' && (r.hasK || (anyK && r.value < 1000)) ? r.value * 1000 : r.value, plus: r.plus }))
    .filter((r) => r.value >= lo && r.value <= hi);
  if (!vals.length) return null;
  const first = vals[0];
  const second = vals.find((v) => v.value > first.value);
  if (second) return { min: first.value, max: second.value, period };
  if (first.plus || /\bfrom\b|\bstarting\b|\bminimum\b/i.test(text)) return { min: first.value, max: null, period };
  if (/\bup\s+to\b|\bmax(?:imum)?\b/i.test(text)) return { min: null, max: first.value, period };
  return { min: first.value, max: first.value, period };
}

/** The first short line of the ad that reads like a salary statement. */
export function findSalaryLine(adText: string): string | null {
  for (const line of adText.split(/\n+/)) {
    const l = line.trim();
    if (!l || l.length > 200) continue;
    if (!/salary|remuneration|package|base|compensation|\bpay\b|per\s+annum|\bp\.?\s?a\b|per\s+(?:hour|day)|day\s+rate|hourly/i.test(l)) continue;
    if (!/\$|\d\s?k\b|\b(?:nzd|aud|usd)\b|\d{2,3},\d{3}/i.test(l)) continue;
    if (parseSalaryText(l)) return l;
  }
  return null;
}

function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

export function formatBand(min: number | null, max: number | null): string {
  if (min != null && max != null) return min === max ? money(min) : `${money(min)}–${money(max)}`;
  if (min != null) return `${money(min)}+`;
  if (max != null) return `up to ${money(max)}`;
  return 'unknown';
}

export interface ResolveSalaryInput {
  title: string;
  /** The listing / page salary field ("$180k – $220k + super", "Competitive", ""). */
  salary: string;
  /** Full ad text, scanned for a salary line when `salary` has no figure. */
  text: string;
  location: string;
}

/** Advertised band in NZD per year if the ad states one, else the estimated market band. */
export function resolveJobSalary(input: ResolveSalaryInput): JobSalary {
  const candidates = [input.salary?.trim() ?? '', findSalaryLine(input.text ?? '') ?? ''].filter((s) => s && SALARY_LINE_RE.test(s));
  for (const text of candidates) {
    const parsed = parseSalaryText(text);
    if (!parsed) continue;
    const currency = detectCurrency(text, input.location);
    const perYear = parsed.period === 'hour' ? HOURS_PER_YEAR : parsed.period === 'day' ? DAYS_PER_YEAR : 1;
    const minNzd = parsed.min != null ? toNzd(parsed.min * perYear, currency) : null;
    const maxNzd = parsed.max != null ? toNzd(parsed.max * perYear, currency) : null;
    const notes = [
      currency !== 'NZD' ? `converted from ${currency}` : '',
      parsed.period !== 'year' ? `${parsed.period} rate annualised (${parsed.period === 'hour' ? `${HOURS_PER_YEAR} h` : `${DAYS_PER_YEAR} days`}), contract` : '',
    ].filter(Boolean);
    return {
      source: 'advertised',
      minNzd,
      maxNzd,
      advertisedText: text,
      currency,
      period: parsed.period,
      basis: `Advertised: ${formatBand(minNzd, maxNzd)} NZD${notes.length ? ` (${notes.join('; ')})` : ''}`,
    };
  }
  const band = estimateMarketBand(input.title, input.location);
  return {
    source: 'estimated',
    minNzd: band.minNzd,
    maxNzd: band.maxNzd,
    advertisedText: null,
    currency: 'NZD',
    period: 'year',
    band: { id: band.id, label: band.label, market: band.market },
    basis: `Not specified — estimated ${formatBand(band.minNzd, band.maxNzd)} NZD for similar roles (${band.label}, ${band.market === 'AU' ? 'Australian market, converted' : 'NZ market'})`,
  };
}

/* ------------------------------------------------------------------------ */
/* Fit and blend                                                             */
/* ------------------------------------------------------------------------ */

/** Below the target, fit falls from 75 to 0 over this many NZD. */
export const BELOW_FALLOFF_NZD = 50_000;
/** Above the target, fit falls from 75 to ABOVE_FLOOR over this many NZD. */
export const ABOVE_FALLOFF_NZD = 150_000;
export const ABOVE_FLOOR = 40;

/**
 * How close a band is to the target range, 0–100:
 *  - inside the target → 100
 *  - overlapping → 75–100 by how much of the narrower range overlaps
 *  - wholly below → 75 at the floor, 0 at BELOW_FALLOFF_NZD under it
 *  - wholly above → 75 at the ceiling, never below ABOVE_FLOOR (more money
 *    is rarely a reason to skip; a much bigger role may be a stretch)
 * A one-sided band ("up to $200k", "$190k+") is treated as that single figure.
 */
export function salaryFit(band: { minNzd: number | null; maxNzd: number | null }, target: { min: number; max: number }): Pick<SalaryAssessment, 'fit' | 'position' | 'gapNzd'> {
  const lo = band.minNzd ?? band.maxNzd;
  const hi = band.maxNzd ?? band.minNzd;
  if (lo == null || hi == null) return { fit: 50, position: 'overlaps', gapNzd: 0 };
  if (lo >= target.min && hi <= target.max) return { fit: 100, position: 'within', gapNzd: 0 };
  const overlap = Math.min(hi, target.max) - Math.max(lo, target.min);
  if (overlap >= 0 && !(hi < target.min) && !(lo > target.max)) {
    const narrower = Math.max(1, Math.min(hi - lo, target.max - target.min));
    return { fit: Math.round(75 + 25 * Math.min(1, overlap / narrower)), position: 'overlaps', gapNzd: 0 };
  }
  if (hi < target.min) {
    const gap = target.min - hi;
    return { fit: Math.max(0, Math.round(75 * (1 - gap / BELOW_FALLOFF_NZD))), position: 'below', gapNzd: gap };
  }
  const gap = lo - target.max;
  return { fit: Math.max(ABOVE_FLOOR, Math.round(75 - (75 - ABOVE_FLOOR) * (gap / ABOVE_FALLOFF_NZD))), position: 'above', gapNzd: gap };
}

/** Clamp the profile weight to 0–MAX_SALARY_WEIGHT, defaulting when absent. */
export function salaryWeight(target: SalaryTarget): number {
  const w = target.weight ?? DEFAULT_SALARY_WEIGHT;
  return Number.isFinite(w) ? Math.max(0, Math.min(MAX_SALARY_WEIGHT, w)) : DEFAULT_SALARY_WEIGHT;
}

/** Usable target: positive, ordered numbers. */
export function isValidSalaryTarget(t: SalaryTarget | undefined | null): t is SalaryTarget {
  return !!t && Number.isFinite(t.min) && Number.isFinite(t.max) && t.min > 0 && t.max >= t.min;
}

export function assessSalary(job: JobSalary, target: SalaryTarget, skillsMatch: number): SalaryAssessment {
  const { fit, position, gapNzd } = salaryFit(job, target);
  const full = salaryWeight(target);
  const weight = job.source === 'estimated' ? full / 2 : full;
  const blendedMatch = Math.round(skillsMatch * (1 - weight / 100) + fit * (weight / 100));
  return { ...job, target: { min: target.min, max: target.max }, fit, position, gapNzd, weight, skillsMatch, blendedMatch };
}

/** One-line verdict, e.g. "$10k below your $180k–$250k target · salary fit 60% · weight 20%". */
export function describeSalaryFit(a: SalaryAssessment): string {
  const target = `${formatBand(a.target.min, a.target.max)} target`;
  const where =
    a.position === 'within'
      ? `within your ${target}`
      : a.position === 'overlaps'
        ? `overlaps your ${target}`
        : `${money(a.gapNzd)} ${a.position} your ${target}`;
  return `${where} · salary fit ${a.fit}% · weight ${a.weight}%`;
}

/**
 * The analysis with salary blended into matchPercentage. No target, or an
 * invalid one, returns the analysis unchanged (salary not scored).
 */
export function applySalaryToAnalysis(analysis: AnalysisResult, input: ResolveSalaryInput, target: SalaryTarget | undefined | null): AnalysisResult {
  if (!isValidSalaryTarget(target)) return analysis;
  const skills = analysis.salary?.skillsMatch ?? analysis.matchPercentage;
  const assessment = assessSalary(resolveJobSalary(input), target, skills);
  return { ...analysis, matchPercentage: assessment.blendedMatch, salary: assessment };
}
