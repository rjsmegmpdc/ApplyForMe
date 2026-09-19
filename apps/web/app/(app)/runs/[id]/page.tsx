import { jobSourceOfUrl, sourceLabel } from '@applyforme/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { getRun } from '@/server/runs';
import { pageIdentity } from '@/lib/ui/session';
import { formatNzFull, hostOf, ORIGIN_TONE, STATUS_TONE } from '@/lib/ui/format';
import { readAnalysis, readTailored, readTrigger } from '@/lib/ui/run-json';
import { Badge } from '@/components/ui/badge';
import { PageTitle, Section, SessionExpired } from '@/components/ui/section';
import { FeedbackActions } from '@/components/runs/feedback-actions';
import styles from './run.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function RawJson({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <details className={styles.raw}>
      <summary>{label}</summary>
      <pre>{text}</pre>
    </details>
  );
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await pageIdentity();
  if (!identity) return <SessionExpired />;

  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) notFound();

  const run = await getRun(getDb(), runId);
  if (!run || run.userId !== identity.userId) notFound();

  const trigger = readTrigger(run.triggerJson);
  const analysis = readAnalysis(run.analysisJson);
  const tailored = readTailored(run.tailoredJson);

  const facts: [string, React.ReactNode][] = [
    ['Company', run.company ?? '—'],
    ['Location', run.location ?? '—'],
    ['Salary', run.salaryText ?? '—'],
    ['Match', run.matchPercentage != null ? `${run.matchPercentage}%` : '—'],
    ['Created', formatNzFull(run.createdAt)],
    ['Updated', formatNzFull(run.updatedAt)],
    ['Job text', run.jobTextSource === 'full-ad' ? 'full ad' : 'alert snippet'],
    ['Job key', run.seekJobId],
  ];

  return (
    <>
      <p className={styles.crumb}>
        <Link href="/runs">← Runs</Link>
      </p>
      <PageTitle
        aside={
          <span className={styles.badges}>
            <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
            {run.origin && run.origin !== 'none' && <Badge tone={ORIGIN_TONE[run.origin] ?? 'muted'}>{run.origin}</Badge>}
          </span>
        }
      >
        {run.jobTitle}
      </PageTitle>

      <Section label="Job">
        <dl className={styles.facts}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.links}>
          <a href={run.jobUrl} target="_blank" rel="noopener noreferrer" className={styles.apply}>
            Apply on {sourceLabel(jobSourceOfUrl(run.jobUrl ?? ''))} ↗
          </a>
          <span className={styles.muted}>{hostOf(run.jobUrl)}</span>
        </p>
      </Section>

      {run.error && (
        <Section label="Error">
          <pre className={styles.error}>{run.error}</pre>
        </Section>
      )}

      <Section label="Actions" description="Applied and Not for me record the outcome; a reason or note becomes a preference for future packs.">
        <FeedbackActions runId={run.id} status={run.status} />
      </Section>

      <Section label="Trigger">
        {trigger ? (
          <>
            <p className={styles.lead}>
              Decision: <strong>{trigger.decision ?? 'unknown'}</strong>
              {trigger.preferredCompany && ' · preferred company'}
            </p>
            {trigger.reasons && trigger.reasons.length > 0 ? (
              <ul className={styles.list}>
                {trigger.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No reasons recorded.</p>
            )}
            {trigger.keywordHits && trigger.keywordHits.length > 0 && <p className={styles.muted}>Keyword hits: {trigger.keywordHits.join(', ')}</p>}
          </>
        ) : (
          <p className={styles.muted}>Not evaluated yet.</p>
        )}
        <RawJson label="Raw trigger JSON" text={run.triggerJson} />
      </Section>

      <Section label="Analysis">
        {analysis ? (
          <>
            {analysis.matches && analysis.matches.length > 0 ? (
              <ul className={styles.matches}>
                {analysis.matches.map((m, i) => (
                  <li key={i} className={m.matched ? styles.matched : styles.unmatched}>
                    <div className={styles.matchHead}>
                      <span className={styles.tick} aria-hidden>
                        {m.matched ? '✓' : '·'}
                      </span>
                      <span>
                        {m.requirement.requirement ?? '(requirement)'}
                        {m.requirement.category && <span className={styles.muted}> · {m.requirement.category}</span>}
                        {m.requirement.importance && <span className={styles.muted}> · {m.requirement.importance}</span>}
                        {m.matchStrength && m.matchStrength !== 'none' && <span className={styles.muted}> · {m.matchStrength}</span>}
                      </span>
                    </div>
                    {m.evidence && m.evidence.length > 0 && (
                      <ul className={styles.evidence}>
                        {m.evidence.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No requirement matches recorded.</p>
            )}
            {analysis.missingSkills && analysis.missingSkills.length > 0 && (
              <p>
                <strong>Missing:</strong> {analysis.missingSkills.join(', ')}
              </p>
            )}
            {analysis.keywordsFound && analysis.keywordsFound.length > 0 && <p className={styles.muted}>Keywords in ad: {analysis.keywordsFound.join(', ')}</p>}
            {analysis.benefitMatches && analysis.benefitMatches.some((b) => b.found) && (
              <p className={styles.muted}>
                Benefits found:{' '}
                {analysis.benefitMatches
                  .filter((b) => b.found)
                  .map((b) => b.keyword)
                  .join(', ')}
              </p>
            )}
          </>
        ) : (
          <p className={styles.muted}>Not analysed.</p>
        )}
        <RawJson label="Raw analysis JSON" text={run.analysisJson} />
      </Section>

      <Section label="Tailored output">
        {tailored ? (
          <>
            {tailored.summary && (
              <>
                <h3 className={styles.h3}>Summary</h3>
                <p>{tailored.summary}</p>
              </>
            )}
            {tailored.highlights && tailored.highlights.length > 0 && (
              <>
                <h3 className={styles.h3}>Highlights</h3>
                {tailored.highlights.map((h, i) => (
                  <div key={i} className={styles.role}>
                    <div className={styles.roleHead}>
                      {h.role ?? 'Role'}
                      {h.company && <span className={styles.muted}> · {h.company}</span>}
                    </div>
                    <ul className={styles.list}>
                      {h.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
            {tailored.coverLetter && tailored.coverLetter.paragraphs.length > 0 && (
              <>
                <h3 className={styles.h3}>Cover letter</h3>
                {tailored.coverLetter.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </>
            )}
          </>
        ) : (
          <p className={styles.muted}>Not tailored{run.status === 'skipped' ? ' — skipped by rules' : ''}.</p>
        )}
        <p className={styles.links}>
          {run.cvKey ? <a href={`/api/runs/${run.id}/download?doc=cv`}>Download CV (.docx)</a> : <span className={styles.muted}>No CV document</span>}
          {run.letterKey ? <a href={`/api/runs/${run.id}/download?doc=letter`}>Download cover letter (.docx)</a> : <span className={styles.muted}>No letter document</span>}
        </p>
        {run.emailMessageId && <p className={styles.muted}>Emailed · message id {run.emailMessageId}</p>}
        <RawJson label="Raw tailored JSON" text={run.tailoredJson} />
      </Section>

      <Section label="Job text">
        <details className={styles.raw}>
          <summary>
            Show {run.jobTextSource === 'full-ad' ? 'full ad' : 'alert snippet'} ({run.jobText.length.toLocaleString()} chars)
          </summary>
          <pre className={styles.jobText}>{run.jobText}</pre>
        </details>
      </Section>
    </>
  );
}
