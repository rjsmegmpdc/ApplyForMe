/**
 * The review email — what lands in the user's inbox for each tailored job.
 * A compact card: score first (so the inbox sorts by eye), title / company /
 * location / salary, the big "Apply on Seek" button, the matched
 * requirements with a line or two of evidence each, missing skills, the
 * tailored summary, a provenance note (live / repaired / FALLBACK), the
 * four signed one-click action buttons, and a link to the run in the app.
 * The CV and letter travel as attachments (added by the pipeline).
 *
 * Inline CSS only, no images or external assets, colours chosen to read on
 * both light and dark mail clients. A plain-text twin carries the same
 * content for clients that strip HTML. Pure: builds strings from inputs.
 */
import type { AnalysisResult, TailoredOutput, TriggerDecision } from '@applyforme/engine';
import type { Run } from '@/server/db/schema';

export type ReviewOrigin = 'live' | 'live-repaired' | 'fallback' | 'none';

export interface ReviewLinks {
  applied: string;
  rejected: string;
  regenerate: string;
  thumbsUp: string;
}

export interface ReviewEmailInput {
  run: Pick<Run, 'id' | 'jobTitle' | 'company' | 'location' | 'salaryText' | 'matchPercentage' | 'jobTextSource'>;
  analysis: AnalysisResult;
  output: TailoredOutput;
  origin: ReviewOrigin;
  decision: TriggerDecision;
  links: ReviewLinks;
  appBaseUrl: string;
  jobUrl: string;
  /** False when ACTION_LINK_SECRET is unset and the buttons just open the run page. */
  linksSigned?: boolean;
  /** Extra one-line notes for the provenance block (e.g. "daily budget reached"). */
  notes?: string[];
}

export interface ReviewEmail {
  subject: string;
  html: string;
  text: string;
}

const APP_TAG = '[ApplyForMe]';
const MAX_MATCHES = 6;
const EVIDENCE_PER_MATCH = 2;

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "Role @ Company: highlight" → "highlight" for the evidence lines. */
function evidenceProse(evidence: string): string {
  const idx = evidence.indexOf(': ');
  return idx >= 0 ? evidence.slice(idx + 2) : evidence;
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

export function buildReviewSubject(run: ReviewEmailInput['run']): string {
  const score = run.matchPercentage != null ? `${run.matchPercentage}%` : 'n/a';
  const parts = [score, run.jobTitle, run.company].filter((p): p is string => !!p && p.trim().length > 0);
  return `${APP_TAG} ${parts.join(' · ')}`;
}

interface OriginCopy {
  label: string;
  detail: string;
  warn: boolean;
}

function originCopy(origin: ReviewOrigin): OriginCopy {
  switch (origin) {
    case 'live':
      return { label: 'Tailored by Claude', detail: 'Passed the fact check on the first pass.', warn: false };
    case 'live-repaired':
      return { label: 'Tailored by Claude (repaired)', detail: 'The first draft failed the fact check; one repair pass fixed it. Worth a closer read.', warn: false };
    case 'fallback':
      return { label: 'FALLBACK — deterministic documents', detail: 'Claude was unavailable or its output failed the fact check twice. These documents were built by keyword matching alone — review carefully before applying.', warn: true };
    case 'none':
      return { label: 'FALLBACK — deterministic documents (daily budget reached)', detail: 'Today\'s tailoring budget is used up, so these documents were built by keyword matching alone — review carefully before applying.', warn: true };
  }
}

/* ------------------------------------------------------------------------ */
/* Builder                                                                   */
/* ------------------------------------------------------------------------ */

export function buildReviewEmail(input: ReviewEmailInput): ReviewEmail {
  const { run, analysis, output, decision, links } = input;
  const subject = buildReviewSubject(run);
  const runUrl = `${trimBase(input.appBaseUrl)}/runs/${run.id}`;
  const origin = originCopy(input.origin);
  const linksSigned = input.linksSigned ?? true;
  const score = run.matchPercentage != null ? `${run.matchPercentage}%` : 'n/a';

  const matched = analysis.matches.filter((m) => m.matched).slice(0, MAX_MATCHES);
  const missing = analysis.missingSkills;
  const metaLine = [run.company, run.location, run.salaryText].filter((p): p is string => !!p && p.trim().length > 0);

  const notes = [...(input.notes ?? [])];
  if (!linksSigned) notes.push('Action links are not signed (ACTION_LINK_SECRET is unset) — the buttons open the run page in the app instead.');
  if (run.jobTextSource === 'alert-snippet') notes.push('The full ad could not be fetched; the analysis used the alert snippet only.');

  /* ---- HTML ---------------------------------------------------------- */
  const h: string[] = [];
  const btn = (href: string, label: string, bg: string): string =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;margin:4px 6px 4px 0;background:${bg};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-family:Arial,Helvetica,sans-serif;font-size:14px">${escapeHtml(label)}</a>`;

  h.push('<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#222222;background:#ffffff;max-width:640px;margin:0 auto;padding:20px">');
  h.push(`<div style="font-size:13px;color:#777777;margin-bottom:8px">ApplyForMe · run #${run.id}</div>`);
  h.push('<div style="border:1px solid #d8dde6;border-radius:10px;padding:18px 20px;background:#f7f9fc;color:#222222">');
  h.push(`<div style="font-size:34px;font-weight:700;color:#1B365D;line-height:1">${escapeHtml(score)}<span style="font-size:14px;font-weight:400;color:#666666;margin-left:8px">match</span></div>`);
  h.push(`<div style="font-size:20px;font-weight:700;color:#1B365D;margin-top:8px">${escapeHtml(run.jobTitle)}</div>`);
  if (metaLine.length > 0) h.push(`<div style="color:#444444;margin-top:2px">${escapeHtml(metaLine.join(' · '))}</div>`);
  h.push(`<div style="margin-top:14px">${btn(input.jobUrl, 'Apply on Seek', '#0d3880')}</div>`);
  h.push('</div>');

  if (origin.warn) {
    h.push(`<div style="margin-top:14px;padding:12px 14px;border-radius:8px;background:#fff4e5;border:1px solid #f0b458;color:#5a3a00"><strong>${escapeHtml(origin.label)}</strong><br>${escapeHtml(origin.detail)}</div>`);
  }

  h.push('<h3 style="font-size:15px;color:#1B365D;margin:18px 0 6px">Matched requirements</h3>');
  if (matched.length === 0) {
    h.push('<p style="margin:0;color:#666666">None of the engine\'s requirement categories were evidenced.</p>');
  } else {
    h.push('<ul style="margin:0;padding-left:18px">');
    for (const m of matched) {
      h.push(`<li style="margin-bottom:6px"><strong>${escapeHtml(m.requirement.category)}</strong> <span style="color:#666666">(${escapeHtml(m.matchStrength)})</span>`);
      const evidence = m.evidence.slice(0, EVIDENCE_PER_MATCH).map(evidenceProse);
      if (evidence.length > 0) {
        h.push('<ul style="margin:2px 0 0;padding-left:16px;color:#444444;font-size:13px">');
        for (const e of evidence) h.push(`<li>${escapeHtml(e)}</li>`);
        h.push('</ul>');
      }
      h.push('</li>');
    }
    h.push('</ul>');
  }

  h.push('<h3 style="font-size:15px;color:#1B365D;margin:18px 0 6px">Missing / unevidenced</h3>');
  h.push(`<p style="margin:0;color:${missing.length ? '#8a1f1f' : '#666666'}">${missing.length ? escapeHtml(missing.join(', ')) : 'Nothing flagged.'}</p>`);

  h.push('<h3 style="font-size:15px;color:#1B365D;margin:18px 0 6px">Tailored summary</h3>');
  h.push(`<p style="margin:0;color:#333333">${escapeHtml(output.summary)}</p>`);

  h.push('<h3 style="font-size:15px;color:#1B365D;margin:18px 0 6px">Why this job was processed</h3>');
  h.push(`<p style="margin:0;color:#444444;font-size:13px">${escapeHtml(decision.reasons.join(' · '))}</p>`);

  h.push(`<div style="margin-top:14px;font-size:13px;color:${origin.warn ? '#5a3a00' : '#444444'}"><strong>Origin:</strong> ${escapeHtml(origin.label)} — ${escapeHtml(origin.detail)}</div>`);
  if (notes.length > 0) {
    h.push('<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;color:#5a3a00">');
    for (const n of notes) h.push(`<li>${escapeHtml(n)}</li>`);
    h.push('</ul>');
  }

  h.push('<div style="margin-top:18px;padding-top:14px;border-top:1px solid #d8dde6">');
  h.push('<div style="font-size:13px;color:#666666;margin-bottom:6px">The CV and cover letter are attached. One click:</div>');
  h.push(btn(links.applied, 'Applied', '#2e7d32'));
  h.push(btn(links.rejected, 'Not for me', '#8a1f1f'));
  h.push(btn(links.regenerate, 'Regenerate with a note', '#2E5090'));
  h.push(btn(links.thumbsUp, 'Looks good', '#4A90D9'));
  h.push('</div>');

  h.push(`<div style="margin-top:14px;font-size:13px;color:#777777">Open in the app: <a href="${escapeHtml(runUrl)}" style="color:#2E5090">${escapeHtml(runUrl)}</a></div>`);
  h.push('</div>');

  /* ---- Plain text ---------------------------------------------------- */
  const t: string[] = [];
  t.push(`ApplyForMe · run #${run.id}`);
  t.push('');
  t.push(`${score} match — ${run.jobTitle}`);
  if (metaLine.length > 0) t.push(metaLine.join(' · '));
  t.push('');
  t.push(`Apply on Seek: ${input.jobUrl}`);
  t.push('');
  if (origin.warn) {
    t.push(`*** ${origin.label} ***`);
    t.push(origin.detail);
    t.push('');
  }
  t.push('Matched requirements:');
  if (matched.length === 0) t.push('  (none)');
  for (const m of matched) {
    t.push(`- ${m.requirement.category} (${m.matchStrength})`);
    for (const e of m.evidence.slice(0, EVIDENCE_PER_MATCH).map(evidenceProse)) t.push(`    * ${e}`);
  }
  t.push('');
  t.push(`Missing / unevidenced: ${missing.length ? missing.join(', ') : 'nothing flagged'}`);
  t.push('');
  t.push('Tailored summary:');
  t.push(output.summary);
  t.push('');
  t.push(`Why processed: ${decision.reasons.join(' · ')}`);
  t.push('');
  t.push(`Origin: ${origin.label} — ${origin.detail}`);
  for (const n of notes) t.push(`Note: ${n}`);
  t.push('');
  t.push('The CV and cover letter are attached. One click:');
  t.push(`  Applied:                ${links.applied}`);
  t.push(`  Not for me:             ${links.rejected}`);
  t.push(`  Regenerate with a note: ${links.regenerate}`);
  t.push(`  Looks good:             ${links.thumbsUp}`);
  t.push('');
  t.push(`Open in the app: ${runUrl}`);

  return { subject, html: h.join('\n'), text: t.join('\n') };
}
