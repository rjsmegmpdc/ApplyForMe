/**
 * Seek.co.nz JobMail alert parser — turns an alert email (HTML or plain
 * text) into `JobListing`s. Ported from v1 src/lib/parsers/seek-email-parser.ts
 * with the fetch removed (see ./seek-page.ts for the page side) and the
 * extraction re-anchored on the job links:
 *
 *  1. Every `https://www.seek.co.nz/job/<id>` link is found (tracking query
 *     strings are stripped; several links per card collapse onto one id).
 *  2. The email is segmented by job id; in each segment the anchor text is
 *     the title and the following lines are read as company / location /
 *     salary / snippet in Seek's card order.
 *  3. Plain-text alerts are segmented around the URL lines instead.
 *  4. With no job links at all, the v1 regex block pattern is tried on the
 *     line-preserved text, then v1's single-job fallback (tightened so a
 *     footer-only email yields nothing).
 *
 * Pure: string in, listings out. Same input → same output.
 */
import type { JobListing } from '../types';
import { collapseWhitespace, decodeEntities, htmlToText, looksLikeHtml } from './html-text';

const JOB_ID_RE = /seek\.co\.nz\/job\/(\d+)(?!\d)/i;
const JOB_URL_GLOBAL_RE = /https?:\/\/(?:www\.)?seek\.co\.nz\/job\/\d+(?!\d)[^\s<>"')\]]*/gi;
const ANCHOR_RE = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

/** Seek job id from any seek.co.nz job URL (tracking params, fragments, sub-paths tolerated). */
export function extractSeekJobId(url: string): string | null {
  if (!url) return null;
  const m = JOB_ID_RE.exec(decodeEntities(url));
  return m ? m[1] : null;
}

/** Normalise a Seek job URL to `https://www.seek.co.nz/job/<id>`. */
export function canonicalSeekUrl(url: string): string | null {
  const id = extractSeekJobId(url);
  return id ? `https://www.seek.co.nz/job/${id}` : null;
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

const BOILERPLATE_LINE_RE = /unsubscribe|manage\s+(?:your\s+)?(?:job\s*mail|alerts?)|privacy\s+policy|terms\s+(?:of\s+use|and\s+conditions)|©|copyright|seek\s+limited|you(?:'re|\s+are)\s+receiving|this\s+email\s+was\s+sent|update\s+your\s+preferences|\bjobmail\b|match(?:es|ing)?\s+your\s+(?:job\s*mail\s+)?alert|new\s+jobs?\s+match/i;
const ACTION_LINE_RE = /^(?:view\s+(?:this\s+)?job|apply(?:\s+now)?|quick\s+apply|save(?:\s+job)?|share|featured|sponsored|promoted|ad|new|hot|posted\b.*|listed\b.*|\d+\s*[hdw]\s+ago|.*\b(?:hours?|days?|weeks?)\s+ago)\s*[:.]?$/i;
const GREETING_RE = /^(?:hi|hello|dear|kia ora)\b[^,]{0,40},?$/i;
const URL_ONLY_RE = /^(?:[a-z ]{0,20}:\s*)?https?:\/\/\S+$/i;

const LOCATION_WORD_RE = /\b(?:auckland|wellington|christchurch|hamilton|tauranga|dunedin|queenstown|napier|hastings|palmerston north|nelson|rotorua|new plymouth|whangarei|whangārei|invercargill|lower hutt|upper hutt|porirua|canterbury|waikato|otago|bay of plenty|hawke'?s bay|manawat[uū]|northland|southland|taranaki|marlborough|gisborne|west coast|wairarapa|north shore|manukau|waitakere|new zealand|aotearoa|remote|work from home|nationwide|sydney|melbourne|brisbane|perth|adelaide|canberra|australia)\b/i;
const ORG_WORD_RE = /\b(?:council|ltd|limited|group|bank|inc|pty|company|trust|university|holdings|services|health|board|agency|ministry|department|recruitment|consulting|partners|nz\s+ltd|corporation|foundation|school|college|hospital|dhb|te whatu ora)\b|\bco\.?$/i;

const SALARY_LINE_RE = /(?:\$|nz\$|au\$)\s?\d|\d+\s*k\b.*\b(?:pa|p\.a\.|per\s+annum|per\s+year)\b|\bcompetitive\s+(?:salary|remuneration|package)\b|\b(?:salary|remuneration)\b.*\d|\bper\s+(?:hour|annum|year|day)\b/i;

function isBoilerplateLine(line: string): boolean {
  return BOILERPLATE_LINE_RE.test(line) || ACTION_LINE_RE.test(line) || GREETING_RE.test(line) || URL_ONLY_RE.test(line);
}

function isSalaryLine(line: string): boolean {
  return line.length <= 120 && SALARY_LINE_RE.test(line);
}

/** True when the line is *only* a location ("Auckland CBD, Auckland"), not a sentence mentioning one. */
function isLocationLine(line: string): boolean {
  if (line.length > 70 || !LOCATION_WORD_RE.test(line)) return false;
  if (ORG_WORD_RE.test(line)) return false;
  if (/[.!?;:]/.test(line) && !/^remote/i.test(line)) return false;
  const wordCount = line.split(/\s+/).length;
  return wordCount <= 6;
}

function stripLeadingBullet(line: string): string {
  return line.replace(/^[•·\-–—*]\s+/, '').trim();
}

// ---------------------------------------------------------------------------
// Field extraction from a block of lines
// ---------------------------------------------------------------------------

interface JobFields {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
}

/**
 * Read a card's lines in Seek order: title, company, location, salary,
 * snippet. `titleHint` is the anchor text when known (HTML path); otherwise
 * the first content line is the title.
 */
function fieldsFromLines(rawLines: string[], titleHint = ''): JobFields | null {
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0 && !isBoilerplateLine(l));

  let title = titleHint.trim();
  if (!title) {
    const idx = lines.findIndex((l) => l.length >= 5);
    if (idx === -1) return null;
    title = lines[idx];
    lines.splice(idx, 1);
  }

  const rest = lines.filter((l) => l !== title);

  let company = '';
  let location = '';
  let salary = '';
  const description: string[] = [];
  let positional = 0; // how many non-salary/location lines we have seen

  for (const line of rest) {
    if (!salary && isSalaryLine(line) && !description.length) {
      salary = line;
      continue;
    }
    if (!location && isLocationLine(line) && !description.length) {
      location = line;
      continue;
    }
    if (!company && positional === 0 && !/^[•·\-–—*]\s/.test(line) && line.length <= 80) {
      company = line;
      positional++;
      continue;
    }
    positional++;
    description.push(stripLeadingBullet(line));
  }

  return {
    title,
    company,
    location,
    salary,
    description: cleanDescription(description.join('\n')),
  };
}

function cleanDescription(text: string): string {
  const boilerplate = [
    /unsubscribe[^\n]*/gi,
    /manage\s+your\s+alerts?[^\n]*/gi,
    /privacy\s+policy[^\n]*/gi,
    /terms\s+(?:of\s+use|and\s+conditions)[^\n]*/gi,
    /©\s*\d{4}\s*seek[^\n]*/gi,
    /seek\.co\.nz/gi,
    /view\s+(?:this\s+)?job[^\n]*/gi,
    /apply\s+now[^\n]*/gi,
  ];

  let cleaned = text;
  for (const pattern of boilerplate) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

// ---------------------------------------------------------------------------
// HTML path: anchor-based segmentation
// ---------------------------------------------------------------------------

interface JobAnchor {
  id: string;
  index: number;
  text: string;
}

function findJobAnchors(html: string): JobAnchor[] {
  const anchors: JobAnchor[] = [];
  ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const id = extractSeekJobId(m[2]);
    if (!id) continue;
    anchors.push({ id, index: m.index, text: collapseWhitespace(htmlToText(m[3])) });
  }
  return anchors;
}

function parseHtmlAlert(html: string): JobListing[] {
  const anchors = findJobAnchors(html);
  if (anchors.length === 0) return [];

  // First anchor per id, in document order.
  const firstById = new Map<string, number>();
  const order: string[] = [];
  for (const a of anchors) {
    if (!firstById.has(a.id)) {
      firstById.set(a.id, a.index);
      order.push(a.id);
    }
  }

  const jobs: JobListing[] = [];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const start = firstById.get(id)!;
    const end = i + 1 < order.length ? firstById.get(order[i + 1])! : html.length;
    const segment = html.slice(start, end);

    const titleHint = anchors
      .filter((a) => a.id === id)
      .map((a) => a.text)
      .find((t) => t.length >= 3 && !isBoilerplateLine(t)) ?? '';

    const lines = htmlToText(segment).split('\n');
    const fields = fieldsFromLines(lines, titleHint);
    if (!fields || fields.title.length < 3) continue;

    jobs.push({ ...fields, url: `https://www.seek.co.nz/job/${id}` });
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// Plain-text path: URL-based segmentation
// ---------------------------------------------------------------------------

interface UrlHit {
  id: string;
  lineIndex: number;
  remainder: string;
}

function blockScore(lines: string[]): number {
  const content = lines.map((l) => l.trim()).filter((l) => l && !isBoilerplateLine(l));
  let score = 0;
  if (content.some(isSalaryLine)) score += 3;
  if (content.some(isLocationLine)) score += 1;
  if (content.length >= 3) score += 1;
  return score;
}

function parseTextAlert(text: string): JobListing[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const hits: UrlHit[] = [];

  lines.forEach((line, lineIndex) => {
    JOB_URL_GLOBAL_RE.lastIndex = 0;
    const urls = line.match(JOB_URL_GLOBAL_RE);
    if (!urls) return;
    const id = extractSeekJobId(urls[0]);
    if (!id) return;
    const remainder = collapseWhitespace(line.replace(JOB_URL_GLOBAL_RE, ' ').replace(/^[a-z ]{0,20}:\s*$/i, ''));
    hits.push({ id, lineIndex, remainder });
  });

  if (hits.length === 0) return [];

  // Decide whether each job's block precedes its URL (Seek's text layout) or
  // follows it, by comparing what sits before the first URL with what sits
  // after the last one.
  const preamble = lines.slice(0, hits[0].lineIndex);
  const footer = lines.slice(hits[hits.length - 1].lineIndex + 1);
  const blockAfterUrl = blockScore(footer) > blockScore(preamble);

  const byId = new Map<string, JobListing>();
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const blockLines = blockAfterUrl
      ? lines.slice(hit.lineIndex + 1, i + 1 < hits.length ? hits[i + 1].lineIndex : lines.length)
      : lines.slice(i > 0 ? hits[i - 1].lineIndex + 1 : 0, hit.lineIndex);

    // Leftover text on the URL line ("Head of X - https://...") is the title
    // unless it is just a "View job:" style label.
    const titleHint = hit.remainder.length >= 5 && !isBoilerplateLine(hit.remainder) ? hit.remainder : '';
    const fields = fieldsFromLines(blockLines, titleHint);
    if (!fields) continue;

    const url = `https://www.seek.co.nz/job/${hit.id}`;
    const existing = byId.get(hit.id);
    if (!existing) {
      byId.set(hit.id, { ...fields, url });
    } else {
      // Merge: fill anything the first sighting was missing.
      existing.company ||= fields.company;
      existing.location ||= fields.location;
      existing.salary ||= fields.salary;
      existing.description ||= fields.description;
    }
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// v1 fallback (no job links present at all)
// ---------------------------------------------------------------------------

function extractSalaryAnywhere(text: string): string {
  const salaryPatterns = [
    /\$[\d,]+\s*[-–]\s*\$[\d,]+/,
    /\$[\d,]+\s*(?:pa|per\s*annum|k|K)/,
    /[\d,]+\s*[-–]\s*[\d,]+\s*(?:pa|per\s*annum|NZD|AUD)/,
  ];
  for (const pattern of salaryPatterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return '';
}

function parseLegacy(text: string): JobListing[] {
  const jobs: JobListing[] = [];

  // v1 block pattern: title line, company line, location line. (v1 collapsed
  // all whitespace before running this, so it could never match; it runs on
  // line-preserved text here.)
  const jobBlockPattern = /([A-Z][^\n]{10,80})\n\s*(?:at\s+)?([A-Z][^\n]{3,60})\n\s*([A-Za-z\s,]+(?:Auckland|Wellington|Christchurch|Hamilton|Remote|New Zealand)[^\n]*)/g;

  let match: RegExpExecArray | null;
  while ((match = jobBlockPattern.exec(text)) !== null) {
    const title = match[1].trim();
    const company = match[2].trim();
    const location = match[3].trim();

    if (isBoilerplateLine(title)) continue;
    if (title.length < 5 || company.length < 2) continue;

    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 1000);
    jobs.push({
      title,
      company,
      location,
      salary: extractSalaryAnywhere(after) || extractSalaryAnywhere(text),
      description: cleanDescription(after),
      url: '',
    });
  }

  if (jobs.length === 0 && text.length > 100) {
    // v1 single-job fallback, tightened: the phrase must introduce a title
    // with a separator so "…signed up for job alerts…" does not qualify.
    const titleMatch = text.match(/(?:new job|job alert|matching job)\s*[:–-]\s*([^\n.]{10,80})/i);
    if (titleMatch && !isBoilerplateLine(titleMatch[1])) {
      const companyMatch = text.match(/(?:company|employer)\s*[:–-]\s*([^\n.]{3,60})/i);
      const locationMatch = text.match(/(Auckland|Wellington|Christchurch|Hamilton|Tauranga|Dunedin|Remote|New Zealand)[^\n]*/i);
      jobs.push({
        title: titleMatch[1].trim(),
        company: companyMatch?.[1]?.trim() || '',
        location: locationMatch?.[0]?.trim() || '',
        salary: extractSalaryAnywhere(text),
        description: cleanDescription(text),
        url: '',
      });
    }
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse a Seek JobMail alert (HTML or plain text) into listings. URLs are
 * canonical and unique per job id; listings with no link come only from the
 * legacy fallback and carry `url: ''`.
 */
export function parseSeekAlert(emailHtmlOrText: string): JobListing[] {
  if (!emailHtmlOrText || !emailHtmlOrText.trim()) return [];

  const isHtml = looksLikeHtml(emailHtmlOrText);
  let jobs = isHtml ? parseHtmlAlert(emailHtmlOrText) : parseTextAlert(emailHtmlOrText);

  if (jobs.length === 0 && isHtml) {
    // HTML with no anchors (some clients flatten links): treat as text.
    jobs = parseTextAlert(htmlToText(emailHtmlOrText));
  }

  if (jobs.length === 0) {
    jobs = parseLegacy(isHtml ? htmlToText(emailHtmlOrText) : emailHtmlOrText);
  }

  // Dedupe by canonical URL (or title+company when there is no URL).
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const key = j.url || `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
