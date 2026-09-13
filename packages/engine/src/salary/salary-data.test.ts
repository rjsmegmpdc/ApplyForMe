import { describe, expect, it } from 'vitest';
import {
  AU_BENEFITS,
  GENERIC_SALARY_ENTRY,
  NZ_BENEFITS,
  findSalaryEntry,
  hasSalaryData,
  lookupSalary,
} from './salary-data';

describe('lookupSalary', () => {
  it('resolves a known title to its curated band', () => {
    const r = lookupSalary('Head of Technology');
    expect(r.jobTitle).toBe('Head of Technology');
    expect(r.nzRange).toEqual({ low: 200000, median: 240000, high: 280000 });
    expect(r.auRange.median).toBe(275000);
    expect(r.marketNotes).toMatch(/Head of Technology/);
    expect(r.commonBenefits).toEqual([...NZ_BENEFITS, ...AU_BENEFITS]);
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it('is case-insensitive and matches a keyword inside a longer title', () => {
    expect(lookupSalary('Senior PRODUCT MANAGER - Payments').nzRange.median).toBe(165000);
    expect(hasSalaryData('cto')).toBe(true);
  });

  it('falls back to the generic technology-leadership band for unknown titles', () => {
    const r = lookupSalary('Head Chef');
    expect(findSalaryEntry('Head Chef')).toBeNull();
    expect(hasSalaryData('Head Chef')).toBe(false);
    expect(r.nzRange).toEqual(GENERIC_SALARY_ENTRY.nzRange);
    expect(r.auRange).toEqual(GENERIC_SALARY_ENTRY.auRange);
    expect(r.marketNotes).toBe(GENERIC_SALARY_ENTRY.marketNotes);
  });

  it('treats a blank title as unknown rather than matching the first row', () => {
    expect(findSalaryEntry('')).toBeNull();
    expect(findSalaryEntry('   ')).toBeNull();
    expect(lookupSalary('').nzRange).toEqual(GENERIC_SALARY_ENTRY.nzRange);
  });

  it('returns fresh arrays so callers cannot mutate the tables', () => {
    const a = lookupSalary('CTO');
    a.sources.push('x');
    a.commonBenefits.pop();
    const b = lookupSalary('CTO');
    expect(b.sources).not.toContain('x');
    expect(b.commonBenefits).toHaveLength(NZ_BENEFITS.length + AU_BENEFITS.length);
  });
});
