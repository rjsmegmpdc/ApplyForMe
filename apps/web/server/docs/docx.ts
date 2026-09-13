/**
 * DOCX rendering — the CV and cover letter as Word documents, ported from
 * v1's docx-generator.ts (same palette, Calibri, section rules, bullets,
 * margins). What changed: the CONTENT now comes from a `TailoredOutput`
 * (the guarded LLM reply or the deterministic fallback) — summary, per-role
 * bullets in the given order, letter body paragraphs — while everything
 * factual around it (contact header, competencies, role dates/locations,
 * certifications, salutation and sign-off) comes straight from the profile.
 * This layer never composes prose; it only lays out what it is given.
 *
 * Pure: no clock (the letter date is injected), no I/O. `docxToBase64`
 * packs a Document for an email attachment / R2 object.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
  convertInchesToTwip,
} from 'docx';
import type { TailoredOutput, UserProfile, CareerRole } from '@applyforme/engine';

const COLORS = {
  primary: '1B365D',
  secondary: '2E5090',
  accent: '4A90D9',
  text: '333333',
  muted: '666666',
};

const FONT = 'Calibri';
const MAX_CERTIFICATIONS = 12;

export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface JobLabel {
  title: string;
  company: string;
}

/* ------------------------------------------------------------------------ */
/* Building blocks (v1 styling)                                              */
/* ------------------------------------------------------------------------ */

function run(text: string, opts: { size?: number; bold?: boolean; color?: string } = {}): TextRun {
  return new TextRun({ text, font: FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color ?? COLORS.text });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [run(text.toUpperCase(), { bold: true, size: 22, color: COLORS.primary })],
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.accent } },
  });
}

function bulletPoint(text: string): Paragraph {
  return new Paragraph({
    children: [run(text, { size: 20 })],
    bullet: { level: 0 },
    spacing: { before: 20, after: 20 },
  });
}

function textParagraph(text: string, spacing?: { before?: number; after?: number }): Paragraph {
  return new Paragraph({
    children: [run(text)],
    spacing: { before: spacing?.before ?? 40, after: spacing?.after ?? 120 },
  });
}

function nameHeading(name: string, size: number): Paragraph {
  return new Paragraph({
    children: [run(name, { bold: true, size, color: COLORS.primary })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 40 },
  });
}

function contactLine(profile: UserProfile, after: number): Paragraph {
  const parts = [profile.personal.address, profile.personal.phone, profile.personal.email, profile.personal.linkedin].filter((p) => p && p.trim().length > 0);
  return new Paragraph({
    children: [run(parts.join('  |  '), { size: 18, color: COLORS.muted })],
    spacing: { after },
  });
}

function pageMargins(inches: number): { top: number; bottom: number; left: number; right: number } {
  const twips = convertInchesToTwip(inches);
  return { top: twips, bottom: twips, left: twips, right: twips };
}

/* ------------------------------------------------------------------------ */
/* Role matching (output block → profile role, for dates and location)       */
/* ------------------------------------------------------------------------ */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function looselyEqual(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** The profile role a highlights block refers to — company first, then title; null when nothing matches. */
export function findProfileRole(profile: UserProfile, block: { role: string; company: string }): CareerRole | null {
  const byCompany = profile.career_history.filter((r) => looselyEqual(r.company, block.company));
  const exact = byCompany.find((r) => looselyEqual(r.title, block.role));
  return exact ?? byCompany[0] ?? null;
}

/* ------------------------------------------------------------------------ */
/* CV                                                                        */
/* ------------------------------------------------------------------------ */

export function renderCvDocx(output: TailoredOutput, profile: UserProfile, job: JobLabel): Document {
  const children: Paragraph[] = [];

  children.push(nameHeading(profile.personal.name, 36));
  children.push(contactLine(profile, 120));

  // Professional summary — the tailored text.
  children.push(sectionHeading('Professional Summary'));
  children.push(new Paragraph({ children: [run(output.summary, { size: 20 })], spacing: { before: 40, after: 120 } }));

  // Core competencies from the profile, two columns.
  const competencies = profile.core_competencies.filter((c) => c.trim().length > 0);
  if (competencies.length > 0) {
    children.push(sectionHeading('Core Competencies'));
    for (let i = 0; i < competencies.length; i += 2) {
      const left = competencies[i];
      const right = competencies[i + 1];
      children.push(
        new Paragraph({
          children: [
            run(`  •  ${left}`, { size: 19 }),
            run(right ? `\t•  ${right}` : '', { size: 19 }),
          ],
          tabStops: [{ type: TabStopType.LEFT, position: TabStopPosition.MAX / 2 }],
          spacing: { before: 20, after: 20 },
        })
      );
    }
  }

  // Career history — output order first; profile roles the output omitted
  // follow with their own top highlights so the chronology has no gaps.
  children.push(sectionHeading('Career History'));
  const covered = new Set<CareerRole>();
  const blocks: { role: CareerRole | null; title: string; company: string; bullets: string[] }[] = [];
  for (const block of output.highlights) {
    const role = findProfileRole(profile, block);
    if (role) covered.add(role);
    blocks.push({ role, title: role?.title ?? block.role, company: role?.company ?? block.company, bullets: block.bullets });
  }
  for (const role of profile.career_history) {
    if (!covered.has(role)) blocks.push({ role, title: role.title, company: role.company, bullets: role.highlights.slice(0, 3) });
  }

  for (const block of blocks) {
    const dates = block.role ? `${block.role.start_date} – ${block.role.end_date}` : '';
    const location = block.role?.location ? `, ${block.role.location}` : '';
    children.push(
      new Paragraph({
        children: [
          run(`${block.title} | ${block.company}`, { bold: true, size: 21, color: COLORS.secondary }),
          run(dates ? `  (${dates}${location})` : '', { size: 19, color: COLORS.muted }),
        ],
        spacing: { before: 120, after: 40 },
      })
    );
    for (const bullet of block.bullets) children.push(bulletPoint(bullet));
  }

  // Certifications — most recent first, capped.
  const certs = [...profile.certifications_and_training].sort((a, b) => b.year - a.year).slice(0, MAX_CERTIFICATIONS);
  if (certs.length > 0) {
    children.push(sectionHeading('Certifications & Professional Development'));
    for (const cert of certs) {
      children.push(
        new Paragraph({
          children: [run(cert.name, { size: 19 }), run(` (${cert.year})`, { size: 19, color: COLORS.muted })],
          bullet: { level: 0 },
          spacing: { before: 10, after: 10 },
        })
      );
    }
  }

  return new Document({
    creator: profile.personal.name,
    title: `${profile.personal.name} — CV — ${job.title} at ${job.company}`,
    sections: [
      {
        properties: {
          page: { margin: { top: convertInchesToTwip(0.6), bottom: convertInchesToTwip(0.6), left: convertInchesToTwip(0.7), right: convertInchesToTwip(0.7) } },
        },
        children,
      },
    ],
  });
}

/* ------------------------------------------------------------------------ */
/* Cover letter                                                              */
/* ------------------------------------------------------------------------ */

/** `dateText` is injected (e.g. "13 September 2026") — no clock in here. */
export function renderLetterDocx(output: TailoredOutput, profile: UserProfile, job: JobLabel, dateText: string): Document {
  const children: Paragraph[] = [];

  children.push(nameHeading(profile.personal.name, 28));
  children.push(contactLine(profile, 200));

  children.push(new Paragraph({ children: [run(dateText, { size: 20 })], spacing: { after: 200 } }));

  const subject = job.company.trim() ? `Re: ${job.title} — ${job.company}` : `Re: ${job.title}`;
  children.push(new Paragraph({ children: [run(subject, { bold: true, size: 21, color: COLORS.secondary })], spacing: { after: 160 } }));

  children.push(new Paragraph({ children: [run('Dear Hiring Manager,')], spacing: { after: 120 } }));

  for (const paragraph of output.coverLetter.paragraphs) {
    const text = paragraph.trim();
    if (text.length > 0) children.push(textParagraph(text));
  }

  children.push(new Paragraph({ children: [run('Yours sincerely,')], spacing: { before: 200, after: 80 } }));
  children.push(new Paragraph({ children: [run(profile.personal.name, { bold: true, size: 22, color: COLORS.primary })] }));

  return new Document({
    creator: profile.personal.name,
    title: `${profile.personal.name} — Cover letter — ${job.title} at ${job.company}`,
    sections: [{ properties: { page: { margin: pageMargins(1) } }, children }],
  });
}

/* ------------------------------------------------------------------------ */
/* Packing and naming                                                        */
/* ------------------------------------------------------------------------ */

/** Base64 of the .docx bytes — what the email attachment and R2 upload consume. */
export async function docxToBase64(doc: Document): Promise<string> {
  return Packer.toBase64String(doc);
}

/** Base64 → bytes (atob is available in both workerd and Node 22). */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function slug(s: string, fallback: string): string {
  const cleaned = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
}

/** `Matt_Harkness_CV_Datacom.docx` — ASCII only, no spaces, bounded length. */
export function safeFilename(profileName: string, kind: 'CV' | 'Cover_Letter', company: string): string {
  const name = slug(profileName, 'Candidate').slice(0, 40);
  const co = slug(company, 'Application').slice(0, 40);
  return `${name}_${kind}_${co}.docx`;
}
