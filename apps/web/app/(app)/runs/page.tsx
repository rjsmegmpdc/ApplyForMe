import Link from 'next/link';
import { getDb } from '@/server/db';
import { listRuns } from '@/server/runs';
import { pageIdentity } from '@/lib/ui/session';
import { formatNz, ORIGIN_TONE, STATUS_TONE } from '@/lib/ui/format';
import { Badge } from '@/components/ui/badge';
import { Note, PageTitle, Section, SessionExpired } from '@/components/ui/section';
import styles from './runs.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Runs inbox — one row per Seek job the pipeline has looked at, newest first. */
export default async function RunsPage() {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const runs = await listRuns(getDb(), identity.userId, { limit: 100 });

  return (
    <>
      <PageTitle aside={`${runs.length} run${runs.length === 1 ? '' : 's'} · times in Pacific/Auckland`}>Runs</PageTitle>

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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Created</th>
                <th>Job</th>
                <th>Company</th>
                <th>Location</th>
                <th className={styles.num}>Match</th>
                <th>Status</th>
                <th>Origin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className={styles.nowrap}>{formatNz(run.createdAt)}</td>
                  <td>
                    <a href={run.jobUrl} target="_blank" rel="noopener noreferrer">
                      {run.jobTitle}
                    </a>
                  </td>
                  <td>{run.company ?? <span className={styles.muted}>—</span>}</td>
                  <td>{run.location ?? <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{run.matchPercentage != null ? `${run.matchPercentage}%` : <span className={styles.muted}>—</span>}</td>
                  <td>
                    <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
                  </td>
                  <td>{run.origin && run.origin !== 'none' ? <Badge tone={ORIGIN_TONE[run.origin] ?? 'muted'}>{run.origin}</Badge> : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.nowrap}>
                    <Link href={`/runs/${run.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
