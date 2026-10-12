import Link from 'next/link';
import { getDb } from '@/server/db';
import { countHeldRuns, getSendsPausedAt, listRuns } from '@/server/runs';
import { SendingToggle } from '@/components/settings/sending-toggle';
import { pageIdentity } from '@/lib/ui/session';
import { toRunRow } from '@/lib/ui/runs-table';
import { RunsDashboard } from '@/components/runs/runs-dashboard';
import { RunUrlForm } from '@/components/runs/run-url-form';
import { Note, PageTitle, Section, SessionExpired } from '@/components/ui/section';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Runs inbox — per-day stats and one sortable, filterable row per job the pipeline has looked at. */
export default async function RunsPage() {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const db = getDb();
  const [runs, pausedAt, held] = await Promise.all([listRuns(db, identity.userId, { limit: 500 }), getSendsPausedAt(db, identity.userId), countHeldRuns(db, identity.userId)]);

  return (
    <>
      <PageTitle aside={`${runs.length} run${runs.length === 1 ? '' : 's'} · times in Pacific/Auckland`}>Runs</PageTitle>

      <SendingToggle initial={{ paused: pausedAt != null, pausedAt: pausedAt?.toISOString() ?? null, held }} />

      <Section label="Analyse a job link">
        <RunUrlForm />
      </Section>

      {runs.length === 0 ? (
        <Section label="Nothing yet">
          <p>
            Runs appear here once Gmail forwards Seek alerts to the Worker. Each alert becomes one run per job: skipped by your rules, or
            tailored and emailed to you for review.
          </p>
          <Note>
            Set up forwarding via <Link href="/settings">Settings</Link> (the confirmation code shows there), then check your{' '}
            <Link href="/rules">Rules</Link> so the right jobs get through.
          </Note>
        </Section>
      ) : (
        <RunsDashboard initialRows={runs.map(toRunRow)} />
      )}
    </>
  );
}
