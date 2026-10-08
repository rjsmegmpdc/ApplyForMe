import { describe, expect, it } from 'vitest';
import { getRun } from '@/server/runs';
import { schema } from '@/server/db';
import { rescoreRunsSalary } from './rescore-salary';
import { setupDb, USER } from './test-support';

async function runWith(db: Awaited<ReturnType<typeof setupDb>>, title: string, salaryText: string | null, analysis: object) {
  const [row] = await db
    .insert(schema.runs)
    .values({ userId: USER, seekJobId: title, jobTitle: title, jobUrl: 'u', jobText: 'Lead the team.', jobTextSource: 'full-ad', location: 'Auckland', salaryText, matchPercentage: 50, analysisJson: JSON.stringify(analysis), status: 'sent' })
    .returning();
  return row.id;
}

describe('rescoreRunsSalary', () => {
  it('adds salary to old runs, re-blends on a new target, and undoes the blend when the target is removed', async () => {
    const db = await setupDb();
    const adv = await runWith(db, 'Head of Product', '$200k - $230k', { matchPercentage: 50 });
    const est = await runWith(db, 'Product Owner', null, { matchPercentage: 50 });
    await db.insert(schema.runs).values({ userId: USER, seekJobId: 'x', jobTitle: 'x', jobUrl: 'u', jobText: 't', jobTextSource: 'full-ad', status: 'skipped' });

    expect(await rescoreRunsSalary(db, USER, { min: 180_000, max: 250_000, currency: 'NZD', weight: 20 })).toEqual({ scanned: 3, updated: 2 });
    expect((await getRun(db, adv))!.matchPercentage).toBe(60);
    const estRun = (await getRun(db, est))!;
    expect(JSON.parse(estRun.analysisJson!).salary).toMatchObject({ source: 'estimated', skillsMatch: 50, weight: 10 });

    await rescoreRunsSalary(db, USER, { min: 240_000, max: 300_000, currency: 'NZD', weight: 20 });
    const moved = JSON.parse((await getRun(db, adv))!.analysisJson!);
    expect(moved.salary).toMatchObject({ skillsMatch: 50, position: 'below', gapNzd: 10_000, fit: 60 });

    expect((await rescoreRunsSalary(db, USER, { min: 240_000, max: 300_000, currency: 'NZD', weight: 20 })).updated).toBe(0);

    await rescoreRunsSalary(db, USER, undefined);
    const back = (await getRun(db, adv))!;
    expect(back.matchPercentage).toBe(50);
    expect(JSON.parse(back.analysisJson!).salary).toBeUndefined();
  });
});
