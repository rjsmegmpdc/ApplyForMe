/**
 * Benefit matching — checks a job ad for each of the user's priority
 * benefits (e.g. "KiwiSaver", "hybrid", "health insurance") and returns the
 * sentence that mentions it. Ported verbatim from `matchBenefits` in v1
 * src/lib/job-analyzer.ts; lives in its own module so the review email can
 * use it without pulling the whole analyser.
 *
 * Pure and deterministic: same inputs → same output.
 */
import type { BenefitMatch, PriorityBenefitItem } from '../types';

export function matchBenefits(jobText: string, priorities: PriorityBenefitItem[]): BenefitMatch[] {
  if (priorities.length === 0) return [];

  const sentences = jobText.split(/[.!?\n]/).filter((s) => s.trim().length > 10);
  const lower = jobText.toLowerCase();

  return priorities.map((p) => {
    const kw = p.keyword.toLowerCase();
    const found = kw.length > 0 && lower.includes(kw);
    let context = '';

    if (found) {
      const matchingSentence = sentences.find((s) => s.toLowerCase().includes(kw));
      context = matchingSentence?.trim().slice(0, 200) || `"${p.keyword}" mentioned in job description`;
    }

    return { keyword: p.keyword, priority: p.priority, found, context };
  });
}
