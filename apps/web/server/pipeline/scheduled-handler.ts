/**
 * The `scheduled` Worker handler (cron every 30 min, wrangler.jsonc) — the
 * safety net behind the inbound path:
 *
 *  - runs in status 'regenerate' (the review email's "Regenerate with a
 *    note" link, or the UI, via recordFeedback) are re-tailored with the
 *    newest preferences and re-sent;
 *  - runs stuck in 'pending' for more than PENDING_RETRY_AFTER_MS (the
 *    Worker died mid-run, a Seek fetch hung…) get ONE retry from their
 *    stored job text; a run still pending after that is marked 'failed'
 *    rather than retried forever. The retry is recorded in `error` as
 *    RETRY_MARKER so the next sweep can tell the two cases apart.
 *  - a user with sending paused is skipped entirely: nothing is tailored,
 *    emailed, retried or abandoned until they resume.
 *
 * `runScheduledSweep` takes PipelineDeps so tests drive it with fakes; the
 * Worker entry builds the real deps from env.
 */
import { and, eq, lt } from 'drizzle-orm';
import { schema } from '@/server/db';
import { isSendingPaused, updateRun } from '@/server/runs';
import { buildPipelineDeps } from './inbound-handler';
import { processRegenerate, type PipelineDeps, type ProcessResult } from './run-job';

export const PENDING_RETRY_AFTER_MS = 10 * 60 * 1000;
export const RETRY_MARKER = 'retried by scheduled sweep';

export interface SweepSummary {
  regenerated: ProcessResult[];
  retried: ProcessResult[];
  /** Runs given up on (still pending after their one retry). */
  abandoned: number[];
  /** Runs left alone because their user has sending paused. */
  pausedSkipped: number;
}

export async function runScheduledSweep(deps: PipelineDeps): Promise<SweepSummary> {
  const { db } = deps;
  const summary: SweepSummary = { regenerated: [], retried: [], abandoned: [], pausedSkipped: 0 };
  // Users with sending paused are left untouched (no regenerate, no retry, no abandon) until they resume.
  const pausedCache = new Map<number, boolean>();
  const paused = async (userId: number) => {
    if (!pausedCache.has(userId)) pausedCache.set(userId, await isSendingPaused(db, userId));
    return pausedCache.get(userId)!;
  };

  const toRegenerate = await db.select().from(schema.runs).where(eq(schema.runs.status, 'regenerate'));
  for (const run of toRegenerate) {
    if (await paused(run.userId)) {
      summary.pausedSkipped += 1;
      continue;
    }
    summary.regenerated.push(await processRegenerate(deps, run.id));
  }

  const cutoff = new Date(deps.now() - PENDING_RETRY_AFTER_MS);
  const stale = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.status, 'pending'), lt(schema.runs.updatedAt, cutoff)));
  for (const run of stale) {
    if (await paused(run.userId)) {
      summary.pausedSkipped += 1;
      continue;
    }
    if (run.error === RETRY_MARKER) {
      await updateRun(db, run.id, { status: 'failed', error: 'still pending after one scheduled retry' });
      summary.abandoned.push(run.id);
      continue;
    }
    await updateRun(db, run.id, { error: RETRY_MARKER });
    summary.retried.push(await processRegenerate(deps, run.id));
  }

  return summary;
}

/** Worker entry (worker.ts `scheduled`). */
export async function handleScheduledSweep(_event: ScheduledController, env: CloudflareEnv, _ctx: ExecutionContext): Promise<void> {
  const summary = await runScheduledSweep(buildPipelineDeps(env));
  console.log(
    `[sweep] regenerated=${summary.regenerated.length} retried=${summary.retried.length} abandoned=${summary.abandoned.length} pausedSkipped=${summary.pausedSkipped}`
  );
}
