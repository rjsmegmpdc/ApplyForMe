/**
 * LinkedIn job-alert / job-notification email parser — turns a LinkedIn
 * email (HTML or plain text, including one that Gmail has forwarded with a
 * "Fwd:" subject) into `JobListing`s. Same shape and contract as
 * ./seek-email.ts: pure, string in, listings out, canonical URLs, one listing
 * per job id.
 *
 * Anchored on LinkedIn job links: `linkedin.com/jobs/view/<id>` and the
 * tracked `linkedin.com/comm/jobs/view/<id>` form. LinkedIn alert cards put
 * the title in the anchor text and then "Company · Location" (or company and
 * location on separate lines) beneath it; single-job notifications also carry
 * "<Title> at <Company>" in the subject, which callers can pass as a hint.
 *
 * LinkedIn never includes the full description in the email, so
 * `description` is the card snippet; the pipeline fetches the job page
 * (guest view, JSON-LD JobPosting) and falls back to this snippet.
 */
import type { JobListing } from '../types';
import { collapseWhitespace, decodeEntities, htmlToText, looksLikeHtml } from './html-text';

const JOB_ID_RE = /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#]*?-)?(\d{6,})(?!\d)/i;
const JOB_URL_GLOBAL_RE = /https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/[^\s<>"')\]]+/gi;
const ANCHOR_RE = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

/** LinkedIn job id from any linkedin.com job URL (tracking params, comm/ prefix, slug prefixes tolerated). */
export function extractLinkedInJobId(url: string): string | null {
  if (!url) return null;
  const m = JOB_ID_RE.exec(decodeEntities(url));
  return m ? m[1] : null;
}

/** Normalise a LinkedIn job URL to `https://www.linkedin.com/jobs/view/<id>/`. */
export function canonicalLinkedInUrl(url: string): string | null {
  const id = extractLinkedInJobId(url);
  return id ? `https://www.linkedin.com/jobs/view/${id}/` : null;
}

const BOILERPLATE_RE = /unsubscribe|manage\s+(?:your\s+)?(?:alerts?|notifications?|preferences)|privacy|terms|©|linkedin\s+corporation|you(?:'re|\s+are)\s+receiving|this\s+email\s+was\s+(?:sent|intended)|help\s+center|see\s+all\s+jobs|view\s+all|easy\s+apply|apply\s+now|be\s+an\s+early\s+applicant|actively\s+recruiting|\d+\s+(?:connections?|school\s+alumni|applicants?)|promoted|new\s+jobs?\s+(?:for|that\s+match)|jobs?\s+(?:you\s+may\s+be|similar)|forwarded\s+message|^from:|^to:|^date:|^subject:|^sent:|^cc:/i;
const TIME_RE = /^\s*(?:\d+\s*(?:m|h|d|w|mo)\s+ago|posted\b.*|just\s+now|yesterday|today)\s*$/i;

function isNoise(line: string): boolean {
  return !line || BOILERPLATE_RE.test(line) || TIME_RE.test(line) || /^https?:\/\//i.test(line) || line.length > 160;
}

function cleanTitle(s: string): string {
  return collapseWhitespace(decodeEntities(s)).replace(/\s*\(?\d+\s+(?:applicants?|new)\)?$/i, '').trim();
}

interface Fields { company: string; location: string; description: string }

/**
 * Read the lines that follow a title inside one job card. LinkedIn renders
 * "Company · Location", "Company - Location", or company then location on
 * the next line; anything after that is treated as snippet text.
 */
function fieldsFromLines(lines: string[]): Fields {
  const useful = lines.map((l) => collapseWhitespace(decodeEntities(l))).filter((l) => !isNoise(l));
  let company = '';
  let location = '';
  const rest: string[] = [];
  for (const line of useful) {
    if (!company) {
      const m = line.match(/^(.{2,80}?)\s+(?:·|•|\||–|-)\s+(.{2,80})$/);
      if (m) { company = m[1].trim(); location = m[2].trim(); continue; }
      company = line; continue;
    }
    if (!location && line.length <= 80 && !/[.!?]$/.test(line)) { location = line; continue; }
    rest.push(line);
  }
  return { company, location, description: rest.join(' ').slice(0, 2000) };
}

interface Anchor { id: string; url: string; text: string; index: number }

function findAnchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(ANCHOR_RE)) {
    const id = extractLinkedInJobId(m[2]);
    if (!id) continue;
    out.push({ id, url: canonicalLinkedInUrl(m[2])!, text: cleanTitle(htmlToText(m[3])), index: m.index ?? 0 });
  }
  return out;
}

function parseHtml(html: string): JobListing[] {
  const anchors = findAnchors(html);
  if (anchors.length === 0) return [];
  // First anchor per id that has a title-like text; image-only anchors have none.
  const byId = new Map<string, Anchor>();
  for (const a of anchors) {
    const cur = byId.get(a.id);
    if (!cur || (!cur.text && a.text) || (a.text && cur.text && a.text.length > cur.text.length && a.text.length < 120)) byId.set(a.id, a);
  }
  const ordered = [...byId.values()].sort((a, b) => a.index - b.index);
  const jobs: JobListing[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    const start = a.index;
    const end = i + 1 < ordered.length ? ordered[i + 1].index : Math.min(html.length, start + 6000);
    const segmentText = htmlToText(html.slice(start, end));
    const lines = segmentText.split('\n').map((l) => l.trim()).filter(Boolean);
    // Drop the title line(s) themselves.
    const titleIdx = lines.findIndex((l) => a.text && cleanTitle(l) === a.text);
    const after = titleIdx >= 0 ? lines.slice(titleIdx + 1) : lines.slice(1);
    const f = fieldsFromLines(after);
    jobs.push({ title: a.text || 'LinkedIn job', company: f.company, location: f.location, salary: '', description: f.description, url: a.url });
  }
  return jobs;
}

function parseText(text: string): JobListing[] {
  const lines = text.split('\n').map((l) => l.trim());
  const jobs: JobListing[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const url = lines[i].match(JOB_URL_GLOBAL_RE)?.[0];
    if (!url) continue;
    const id = extractLinkedInJobId(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // Title: nearest non-noise line above the URL.
    let title = '';
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (!isNoise(lines[j])) { title = cleanTitle(lines[j]); break; }
    }
    const f = fieldsFromLines(lines.slice(i + 1, i + 8));
    jobs.push({ title: title || 'LinkedIn job', company: f.company, location: f.location, salary: '', description: f.description, url: canonicalLinkedInUrl(url)! });
  }
  return jobs;
}

/** "Head of Technology Architecture at Auckland Council" → { title, company }; "Fwd:"/"Re:" prefixes and LinkedIn's suffixes stripped. */
export function parseLinkedInSubject(subject: string): { title: string; company: string } | null {
  const s = collapseWhitespace(subject).replace(/^(?:(?:fwd?|re|fw)\s*:\s*)+/i, '').replace(/\s*[-|:]\s*linkedin.*$/i, '').trim();
  const m = s.match(/^(.{4,120}?)\s+at\s+(.{2,80})$/i);
  return m ? { title: m[1].trim(), company: m[2].trim() } : null;
}

/**
 * Parse a LinkedIn job email into listings. `subject` is optional; for a
 * single-job notification it fills title/company when the body gave none.
 */
export function parseLinkedInAlert(emailHtmlOrText: string, subject = ''): JobListing[] {
  if (!emailHtmlOrText || !emailHtmlOrText.trim()) return [];
  const isHtml = looksLikeHtml(emailHtmlOrText);
  let jobs = isHtml ? parseHtml(emailHtmlOrText) : parseText(emailHtmlOrText);
  if (jobs.length === 0 && isHtml) jobs = parseText(htmlToText(emailHtmlOrText));

  const hint = parseLinkedInSubject(subject);
  if (hint) {
    for (const j of jobs) {
      if (j.title === 'LinkedIn job' || !j.title) j.title = hint.title;
      if (!j.company && j.title.toLowerCase() === hint.title.toLowerCase()) j.company = hint.company;
    }
    if (jobs.length === 1 && !jobs[0].company) jobs[0].company = hint.company;
  }

  const seen = new Set<string>();
  return jobs.filter((j) => (seen.has(j.url) ? false : (seen.add(j.url), true)));
}
