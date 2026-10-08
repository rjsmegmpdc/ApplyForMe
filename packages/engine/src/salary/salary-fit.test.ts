import { describe, expect, it } from 'vitest';
import { estimateMarketBand, isAustralianLocation, marketBandFor } from './market-bands';
import {
  applySalaryToAnalysis,
  assessSalary,
  describeSalaryFit,
  findSalaryLine,
  parseSalaryText,
  resolveJobSalary,
  salaryFit,
} from './salary-fit';
import type { AnalysisResult } from '../analyze/job-analyzer';

const TARGET = { min: 180_000, max: 250_000, currency: 'NZD' as const, weight: 20 };

describe('marketBandFor', () => {
  it.each([
    ['Chief Product and Technology Officer', 'c-level'],
    ['Chief Technology Officer', 'c-level'],
    ['CTO', 'c-level'],
    ['CISO', 'ciso'],
    ['Head of Cyber Security', 'ciso'],
    ['General Manager Digital', 'general-manager'],
    ['Director of Customer Delivery & Operations', 'director'],
    ['Head of Product', 'head-of-product'],
    ['Head of Technology Engineering', 'head-of-technology'],
    ['Head of Digital Enablement', 'head-of-technology'],
    ['Head of Data & AI', 'head-of-data'],
    ['Head of Retention', 'head-of'],
    ['Enterprise Architect', 'enterprise-architect'],
    ['Manager Technology Engineering and Architecture', 'engineering-manager'],
    ['Technology Portfolio Manager', 'portfolio-programme'],
    ['Value Stream Lead - Value, Viability & Growth', 'portfolio-programme'],
    ['Technical Lead Architect', 'architect'],
    ['Senior Product Manager', 'senior-product'],
    ['Product Owner', 'product'],
    ['Client and Delivery Manager - Major Engagements', 'delivery-manager'],
    ['IT Manager', 'it-manager'],
    ['Integration Project Manager', 'project-manager'],
    ['Tech Lead', 'tech-lead'],
    ['Compliance & IT Manager', 'it-manager'],
    ['Data Centre Foreman x 3 positions', 'general'],
  ])('%s → %s', (title, id) => {
    expect(marketBandFor(title).id).toBe(id);
  });

  it('every band is ordered and in a sane NZD range', () => {
    for (const t of ['CTO', 'Head of Product', 'Product Owner', 'Foreman']) {
      const b = marketBandFor(t);
      expect(b.minNzd).toBeGreaterThanOrEqual(80_000);
      expect(b.maxNzd).toBeGreaterThan(b.minNzd);
    }
  });
});

describe('Australian market', () => {
  it('detects AU locations without tripping on NZ ones', () => {
    expect(isAustralianLocation('Sydney NSW')).toBe(true);
    expect(isAustralianLocation('Melbourne, Australia')).toBe(true);
    expect(isAustralianLocation('Remote - VIC')).toBe(true);
    expect(isAustralianLocation('Auckland CBD, Auckland (Hybrid)')).toBe(false);
    expect(isAustralianLocation('Wellington Central, Wellington')).toBe(false);
    expect(isAustralianLocation('')).toBe(false);
  });
  it('AU estimates are the NZ band × premium × AUD→NZD, rounded to $5k', () => {
    const nz = estimateMarketBand('Head of Product', 'Auckland');
    const au = estimateMarketBand('Head of Product', 'Sydney NSW');
    expect(nz).toMatchObject({ market: 'NZ', minNzd: 170_000, maxNzd: 240_000 });
    expect(au.market).toBe('AU');
    expect(au.minNzd).toBe(215_000);
    expect(au.maxNzd).toBe(300_000);
  });
});

describe('parseSalaryText / findSalaryLine', () => {
  it('reads ranges, k, from / up to, and hourly / day rates', () => {
    expect(parseSalaryText('$180k – $220k + super')).toEqual({ min: 180_000, max: 220_000, period: 'year' });
    expect(parseSalaryText('$150,000 - $170,000 per annum')).toEqual({ min: 150_000, max: 170_000, period: 'year' });
    expect(parseSalaryText('150-180k')).toEqual({ min: 150_000, max: 180_000, period: 'year' });
    expect(parseSalaryText('From $200,000')).toEqual({ min: 200_000, max: null, period: 'year' });
    expect(parseSalaryText('Up to $240k')).toEqual({ min: null, max: 240_000, period: 'year' });
    expect(parseSalaryText('$95 - $110 per hour')).toEqual({ min: 95, max: 110, period: 'hour' });
    expect(parseSalaryText('$1,100 per day')).toEqual({ min: 1100, max: 1100, period: 'day' });
    expect(parseSalaryText('Competitive salary')).toBeNull();
    expect(parseSalaryText('Lead a team of 40')).toBeNull();
  });
  it('finds a salary line in ad text and ignores budgets and headcounts', () => {
    const ad = 'About the role\nYou will own a $5m budget and a team of 40.\nSalary: $190,000 – $230,000 + KiwiSaver\nApply now';
    expect(findSalaryLine(ad)).toBe('Salary: $190,000 – $230,000 + KiwiSaver');
    expect(findSalaryLine('Own a $5m budget. Team of 40. Great culture.')).toBeNull();
  });
});

describe('resolveJobSalary', () => {
  it('uses the listing salary when it has figures', () => {
    const s = resolveJobSalary({ title: 'Head of Product', salary: '$200k – $230k + super', text: '', location: 'Auckland' });
    expect(s).toMatchObject({ source: 'advertised', minNzd: 200_000, maxNzd: 230_000, currency: 'NZD', period: 'year' });
    expect(s.basis).toBe('Advertised: $200k–$230k NZD');
  });
  it('falls back to a salary line in the ad text', () => {
    const s = resolveJobSalary({ title: 'CTO', salary: 'Competitive', text: 'Remuneration: $280,000 - $320,000 plus bonus', location: 'Auckland' });
    expect(s).toMatchObject({ source: 'advertised', minNzd: 280_000, maxNzd: 320_000 });
  });
  it('converts AUD (explicit, or "$" on an Australian job) and annualises day rates', () => {
    expect(resolveJobSalary({ title: 'x', salary: 'AUD 200,000', text: '', location: 'Auckland' })).toMatchObject({ currency: 'AUD', minNzd: 224_000 });
    expect(resolveJobSalary({ title: 'x', salary: '$200,000', text: '', location: 'Sydney NSW' })).toMatchObject({ currency: 'AUD', minNzd: 224_000 });
    const day = resolveJobSalary({ title: 'x', salary: '$1,000 per day', text: '', location: 'Wellington' });
    expect(day).toMatchObject({ period: 'day', minNzd: 220_000, maxNzd: 220_000 });
    expect(day.basis).toMatch(/day rate annualised \(220 days\), contract/);
  });
  it('estimates from the market band when nothing is advertised, and says so', () => {
    const s = resolveJobSalary({ title: 'Head of Technology', salary: '', text: 'Great culture, competitive package.', location: 'Auckland CBD' });
    expect(s).toMatchObject({ source: 'estimated', minNzd: 190_000, maxNzd: 280_000, band: { id: 'head-of-technology', market: 'NZ' } });
    expect(s.basis).toMatch(/^Not specified — estimated \$190k–\$280k NZD for similar roles/);
  });
});

describe('salaryFit', () => {
  const t = { min: 180_000, max: 250_000 };
  it('within → 100, overlapping → 75–100', () => {
    expect(salaryFit({ minNzd: 190_000, maxNzd: 230_000 }, t)).toEqual({ fit: 100, position: 'within', gapNzd: 0 });
    expect(salaryFit({ minNzd: 160_000, maxNzd: 200_000 }, t)).toMatchObject({ position: 'overlaps', fit: 88 });
    expect(salaryFit({ minNzd: 150_000, maxNzd: 300_000 }, t)).toMatchObject({ position: 'overlaps', fit: 100 });
    expect(salaryFit({ minNzd: 150_000, maxNzd: 180_000 }, t)).toMatchObject({ position: 'overlaps', fit: 75 });
  });
  it('below falls to 0 over $50k; above keeps a floor', () => {
    expect(salaryFit({ minNzd: 140_000, maxNzd: 170_000 }, t)).toEqual({ fit: 60, position: 'below', gapNzd: 10_000 });
    expect(salaryFit({ minNzd: 100_000, maxNzd: 120_000 }, t)).toMatchObject({ fit: 0, position: 'below' });
    expect(salaryFit({ minNzd: 280_000, maxNzd: 400_000 }, t)).toMatchObject({ position: 'above', fit: 68, gapNzd: 30_000 });
    expect(salaryFit({ minNzd: 600_000, maxNzd: 700_000 }, t).fit).toBe(40);
  });
  it('one-sided bands are a single figure', () => {
    expect(salaryFit({ minNzd: null, maxNzd: 200_000 }, t).position).toBe('within');
    expect(salaryFit({ minNzd: 260_000, maxNzd: null }, t).position).toBe('above');
  });
});

describe('assessSalary / applySalaryToAnalysis', () => {
  const analysis = { matchPercentage: 50 } as AnalysisResult;
  it('blends with full weight when advertised and half when estimated', () => {
    const adv = assessSalary({ source: 'advertised', minNzd: 190_000, maxNzd: 230_000, advertisedText: 'x', currency: 'NZD', period: 'year', basis: '' }, TARGET, 50);
    expect(adv).toMatchObject({ weight: 20, fit: 100, skillsMatch: 50, blendedMatch: 60 });
    const est = assessSalary({ source: 'estimated', minNzd: 115_000, maxNzd: 155_000, advertisedText: null, currency: 'NZD', period: 'year', basis: '' }, TARGET, 50);
    expect(est).toMatchObject({ weight: 10, position: 'below', fit: 38 });
    expect(est.blendedMatch).toBe(49);
    expect(describeSalaryFit(adv)).toBe('within your $180k–$250k target · salary fit 100% · weight 20%');
    expect(describeSalaryFit(est)).toBe('$25k below your $180k–$250k target · salary fit 38% · weight 10%');
  });
  it('sets matchPercentage to the blend, is idempotent, and is a no-op without a valid target', () => {
    const input = { title: 'Head of Product', salary: '$200k-$230k', text: '', location: 'Auckland' };
    const once = applySalaryToAnalysis(analysis, input, TARGET);
    expect(once.matchPercentage).toBe(60);
    expect(once.salary?.skillsMatch).toBe(50);
    expect(applySalaryToAnalysis(once, input, TARGET).matchPercentage).toBe(60);
    expect(applySalaryToAnalysis(analysis, input, undefined)).toBe(analysis);
    expect(applySalaryToAnalysis(analysis, input, { min: 250_000, max: 180_000, currency: 'NZD' })).toBe(analysis);
  });
  it('clamps the weight to 0–50', () => {
    const job = { source: 'advertised' as const, minNzd: 100_000, maxNzd: 100_000, advertisedText: 'x', currency: 'NZD' as const, period: 'year' as const, basis: '' };
    expect(assessSalary(job, { ...TARGET, weight: 90 }, 80).weight).toBe(50);
    expect(assessSalary(job, { ...TARGET, weight: -5 }, 80).blendedMatch).toBe(80);
  });
});
