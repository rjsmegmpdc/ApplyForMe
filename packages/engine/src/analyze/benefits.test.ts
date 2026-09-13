import { describe, expect, it } from 'vitest';
import { matchBenefits } from './benefits';

const AD = `We offer a competitive package. Hybrid working with 2 days in our Auckland office.
KiwiSaver employer contribution of 4% and Southern Cross health insurance.
Bring your dog to work!`;

describe('matchBenefits', () => {
  it('returns [] for no priorities', () => {
    expect(matchBenefits(AD, [])).toEqual([]);
  });

  it('marks found benefits with the sentence that mentions them', () => {
    const result = matchBenefits(AD, [
      { keyword: 'KiwiSaver', priority: 1 },
      { keyword: 'hybrid', priority: 2 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ keyword: 'KiwiSaver', priority: 1, found: true });
    expect(result[0].context).toContain('KiwiSaver employer contribution');
    expect(result[1]).toMatchObject({ keyword: 'hybrid', found: true });
    expect(result[1].context).toContain('Hybrid working');
  });

  it('marks absent benefits as not found with empty context', () => {
    const [r] = matchBenefits(AD, [{ keyword: 'company car', priority: 3 }]);
    expect(r).toEqual({ keyword: 'company car', priority: 3, found: false, context: '' });
  });

  it('is case-insensitive and preserves input order', () => {
    const result = matchBenefits(AD, [
      { keyword: 'HEALTH INSURANCE', priority: 2 },
      { keyword: 'dog', priority: 9 },
    ]);
    expect(result.map((r) => r.keyword)).toEqual(['HEALTH INSURANCE', 'dog']);
    expect(result.every((r) => r.found)).toBe(true);
  });

  it('never matches an empty keyword', () => {
    const [r] = matchBenefits(AD, [{ keyword: '', priority: 1 }]);
    expect(r.found).toBe(false);
  });

  it('falls back to a generic context when the keyword is in a too-short sentence', () => {
    const [r] = matchBenefits('Perks: gym.', [{ keyword: 'gym', priority: 1 }]);
    expect(r.found).toBe(true);
    expect(r.context).toBe('"gym" mentioned in job description');
  });
});
