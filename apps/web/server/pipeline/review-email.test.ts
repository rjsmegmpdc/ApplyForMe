import { describe, it, expect } from 'vitest';
import { FIXTURE_PROFILE } from '../../../../packages/engine/src/__fixtures__/profile';
import { buildSeekJobPage } from '../../../../packages/engine/src/__fixtures__/seek-job-page';
import { analyzeJob, DEFAULT_TRIGGER_RULES, evaluateTrigger, extractJobAdText } from '@applyforme/engine';
import { buildReviewEmail, buildReviewSubject, escapeHtml, type ReviewEmailInput } from './review-email';
import { VALID_OUTPUT } from './test-support';

const JOB_TEXT = extractJobAdText(buildSeekJobPage());
const analysis = analyzeJob(JOB_TEXT, FIXTURE_PROFILE, { title: 'Head of Modern Workplace', company: 'Datacom' });
const decision = evaluateTrigger(
  { title: 'Head of Modern Workplace', company: 'Datacom', location: 'Auckland', salary: '', text: JOB_TEXT, matchPercentage: 72 },
  DEFAULT_TRIGGER_RULES
);

const LINKS = {
  applied: 'https://app.test/api/runs/7/action?a=applied&exp=1&sig=aa',
  rejected: 'https://app.test/api/runs/7/action?a=rejected&exp=1&sig=bb',
  regenerate: 'https://app.test/api/runs/7/action?a=regenerate&exp=1&sig=cc',
  thumbsUp: 'https://app.test/api/runs/7/action?a=thumbs-up&exp=1&sig=dd',
};

function input(overrides: Partial<ReviewEmailInput> = {}): ReviewEmailInput {
  return {
    run: { id: 7, jobTitle: 'Head of Modern Workplace', company: 'Datacom', location: 'Auckland CBD', salaryText: '$180k–$200k', matchPercentage: 72, jobTextSource: 'full-ad' },
    analysis,
    output: VALID_OUTPUT,
    origin: 'live',
    decision,
    links: LINKS,
    appBaseUrl: 'https://app.test/',
    jobUrl: 'https://www.seek.co.nz/job/84120987',
    ...overrides,
  };
}

describe('buildReviewEmail', () => {
  it('subject is score first, then title and company', () => {
    expect(buildReviewEmail(input()).subject).toBe('[ApplyForMe] 72% · Head of Modern Workplace · Datacom');
    expect(buildReviewSubject({ ...input().run, matchPercentage: null, company: null })).toBe('[ApplyForMe] n/a · Head of Modern Workplace');
  });

  it('html and text both carry the Apply link, all four action links, the run link, summary, matches and missing skills', () => {
    const { html, text } = buildReviewEmail(input());
    for (const body of [html, text]) {
      expect(body).toContain('https://www.seek.co.nz/job/84120987');
      for (const link of Object.values(LINKS)) expect(body).toContain(link.replace(/&/g, body === html ? '&amp;' : '&'));
      expect(body).toContain('https://app.test/runs/7');
      expect(body).toContain(VALID_OUTPUT.summary);
      expect(body).toContain('Matched requirements');
      expect(body).toContain('Microsoft 365');
      expect(body).toContain('$180k–$200k');
      expect(body).toContain('run #7');
    }
    expect(html).toContain('Apply on Seek');
    expect(html).toContain('Tailored by Claude');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<link|<img/);
  });

  it('shows the fallback banner only for fallback / budget origins', () => {
    const live = buildReviewEmail(input({ origin: 'live' }));
    expect(live.html).not.toContain('FALLBACK');
    expect(live.text).not.toContain('FALLBACK');

    const repaired = buildReviewEmail(input({ origin: 'live-repaired' }));
    expect(repaired.html).toContain('repaired');
    expect(repaired.html).not.toContain('FALLBACK');

    const fallback = buildReviewEmail(input({ origin: 'fallback' }));
    expect(fallback.html).toContain('FALLBACK — deterministic documents');
    expect(fallback.html).toContain('review carefully');
    expect(fallback.text).toContain('*** FALLBACK');

    const budget = buildReviewEmail(input({ origin: 'none', notes: ['Daily tailoring budget of 25 reached (25 live runs today).'] }));
    expect(budget.html).toContain('daily budget reached');
    expect(budget.html).toContain('Daily tailoring budget of 25 reached');
    expect(budget.text).toContain('Note: Daily tailoring budget');
  });

  it('says so when links are unsigned or the ad was only the alert snippet', () => {
    const { html, text } = buildReviewEmail(input({ linksSigned: false, run: { ...input().run, jobTextSource: 'alert-snippet' } }));
    expect(html).toContain('not signed');
    expect(text).toContain('not signed');
    expect(html).toContain('alert snippet');
  });

  it('escapes HTML in job data', () => {
    const { html } = buildReviewEmail(input({ run: { ...input().run, jobTitle: 'Head <b>of</b> "Ops" & More' } }));
    expect(html).toContain('Head &lt;b&gt;of&lt;/b&gt; &quot;Ops&quot; &amp; More');
    expect(html).not.toContain('<b>of</b>');
    expect(escapeHtml('<a href="x">\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;');
  });
});
