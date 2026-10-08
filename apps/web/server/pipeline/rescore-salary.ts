/**
 * Re-score salary on a user's stored runs after the profile's salary target
 * changes (called from PUT /api/profile, and by the admin route for a one-off
 * backfill). Only the salary part of the score moves: the skills match stored
 * in each analysis is kept, the band is re-resolved from the run's own title /
 * salary text / ad text / location, and matchPercentage is re-blended. With
 * no target, any previous blend is undone. Trigger decisions (skip/process)
 * are NOT re-run and nothing is emailed.
 */
import { eq } from 'drizzle-orm';
import { applySalaryToAnalysis, type AnalysisResult, type SalaryTarget } from '@applyforme/engine';
import type { Db } from '@/server/db';
import { schema } from '@/server/db';

export function rescoreAnalysis(
  analysis: AnalysisResult,
  run: { jobTitle: string; salaryText: string | null; jobText: string; location: string | null },
  target: SalaryTarget | undefined | null
): AnalysisResult {
  const base: AnalysisResult = analysis.salary ? { ...analysis, matchPercentage: analysis.salary.skillsMatch } : analysis;
  if (analysis.salary) delete (base as { salary?: unknown }).salary;
  return applySalaryToAnalysis(base, { title: run.jobTitle, salary: run.salaryText ?? '', text: run.jobText, location: run.location ?? '' }, target);
}

export async function rescoreRunsSalary(db: Db, userId: number, target: SalaryTarget | undefined | null): Promise<{ scanned: number; updated: number }> {
  const runs = await db.select().from(schema.runs).where(eq(schema.runs.userId, userId));
  let updated = 0;
  for (const run of runs) {
    if (!run.analysisJson) continue;
    let analysis: AnalysisResult;
    try {
      analysis = JSON.parse(run.analysisJson) as AnalysisResult;
    } catch {
      continue;
    }
    if (typeof analysis.matchPercentage !== 'number') continue;
    const next = rescoreAnalysis(analysis, run, target);
    if (next.matchPercentage === run.matchPercentage && JSON.stringify(next.salary ?? null) === JSON.stringify(analysis.salary ?? null)) continue;
    await db
      .update(schema.runs)
      .set({ matchPercentage: next.matchPercentage, analysisJson: JSON.stringify(next) })
      .where(eq(schema.runs.id, run.id));
    updated += 1;
  }
  return { scanned: runs.length, updated };
}
