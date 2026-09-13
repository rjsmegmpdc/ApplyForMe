/**
 * The tailoring step — the only place the pipeline asks a model for prose.
 *
 * The engine owns facts; the LLM owns language. The prompt hands Claude a
 * fact sheet (profileFactsText — exactly what the claim guard later traces
 * against), the analyser's evidence for this job and the full ad, and asks
 * for a structured reply: a summary, per-role bullets, and cover-letter
 * body paragraphs. `tailorWithGuard` then runs checkClaims; on violations it
 * gives the model ONE repair turn (its own reply echoed back as the
 * assistant turn, plus buildRepairInstruction), and if that still fails
 * returns null so the caller uses `deterministicTailored` — v1's
 * keyword-built summary/highlights plus its cover-letter prose, ported here
 * so the DOCX layer only renders.
 *
 * System-prompt order is chosen for the prompt cache: rules (identical for
 * everyone) → the user's tuning notes (stable per user) → the fact sheet
 * (stable per user, carries the cache breakpoint). Everything that varies
 * per job — the ad, the evidence — lives in the user turn after it.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import {
  analysisEvidenceText,
  buildRepairInstruction,
  checkClaims,
  profileFactsText,
  type AnalysisResult,
  type TailoredOutput,
  type UserProfile,
} from '@applyforme/engine';
import type { GenerateFn } from './anthropic';

export const tailoredOutputSchema: z.ZodType<TailoredOutput> = z.object({
  summary: z.string().describe('3–5 sentence professional summary tailored to this job, no first or third person pronouns'),
  highlights: z.array(
    z.object({
      role: z.string().describe('Role title exactly as written in the fact sheet'),
      company: z.string().describe('Company exactly as written in the fact sheet'),
      bullets: z.array(z.string()).describe('3–6 bullets for this role, most relevant to the job first'),
    })
  ),
  coverLetter: z.object({
    paragraphs: z.array(z.string()).describe('Body paragraphs only — no salutation, date or sign-off'),
  }),
});

export interface TailorPreference {
  kind: string;
  text: string;
}

export interface TailorInput {
  profile: UserProfile;
  analysis: AnalysisResult;
  jobText: string;
  job: { title: string; company: string; location: string; url: string };
  preferences: TailorPreference[];
}

export type TailorOrigin = 'live' | 'live-repaired';

export interface TailorResult {
  output: TailoredOutput;
  origin: TailorOrigin;
}

/* ------------------------------------------------------------------------ */
/* Prompt                                                                    */
/* ------------------------------------------------------------------------ */

const RULES = [
  'You are tailoring an existing CV and writing a cover letter for a specific job. The candidate\'s master profile is given below as a FACT SHEET; the job ad and the deterministic analysis of it follow in the user message.',
  '',
  'Hard rules — these are checked mechanically after you answer, and a breach means your work is discarded:',
  '- You may reorder, select and reword material from the fact sheet. You may NEVER add an employer, job title, date, certification, number or achievement that is not in the fact sheet.',
  '- Every number you write (years, counts, percentages, dollar figures, product versions such as "365") must appear verbatim in the fact sheet or in the job ad.',
  '- Keep each role\'s title and company strings EXACTLY as they appear in the fact sheet.',
  '- Do not claim a qualification, certification or membership unless the fact sheet lists it.',
  '',
  'Style:',
  '- New Zealand English (organisation, programme, licence). Plain prose, no markdown, no bullet symbols inside strings, no headings.',
  '- Summary: 3–5 sentences, written without pronouns (no "I", no "he/she", no name) — the CV summary voice, e.g. "Technology leader with…".',
  '- Highlights: for each role in the fact sheet, in the fact sheet\'s order, choose the 3–6 bullets most relevant to this job, most relevant first, reworded to echo the ad\'s language where that is honest. Every bullet must trace to one of that role\'s own highlights.',
  '- Cover letter: first person, 3–5 body paragraphs, at most 320 words in total. The opening names the role and the company; the middle paragraphs connect the candidate\'s evidence to the ad\'s requirements; the closing is warm and specific to this employer. Do not write the salutation, date or sign-off — the document template adds them.',
  '- If the candidate lacks something the ad asks for, do not invent it; either leave it out or, in the letter, name adjacent experience honestly.',
].join('\n');

const PREFERENCE_LABEL: Record<string, string> = {
  tone: 'Tone',
  avoid: 'Avoid',
  emphasise: 'Emphasise',
  note: 'Note',
};

/** The user's steering notes as a stable block, "(none yet)" when empty so the block shape never changes. */
export function renderTuningNotes(preferences: TailorPreference[]): string {
  const lines = ['Tuning notes from the candidate (apply these; they refine the style rules above):'];
  const cleaned = preferences.map((p) => ({ kind: p.kind, text: p.text.trim() })).filter((p) => p.text.length > 0);
  if (cleaned.length === 0) {
    lines.push('- (none yet)');
    return lines.join('\n');
  }
  for (const p of cleaned) {
    const label = PREFERENCE_LABEL[p.kind] ?? p.kind;
    lines.push(`- ${label}: ${p.text}`);
  }
  return lines.join('\n');
}

export function buildTailorPrompt(input: TailorInput): { system: Anthropic.TextBlockParam[]; user: string } {
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: RULES },
    { type: 'text', text: renderTuningNotes(input.preferences) },
    { type: 'text', text: `FACT SHEET\n\n${profileFactsText(input.profile)}`, cache_control: { type: 'ephemeral' } },
  ];

  const user = [
    'JOB',
    `Title: ${input.job.title}`,
    `Company: ${input.job.company}`,
    `Location: ${input.job.location || 'not stated'}`,
    `URL: ${input.job.url}`,
    '',
    'ANALYSIS (deterministic; evidence lines are verbatim from the fact sheet)',
    analysisEvidenceText(input.analysis, input.profile),
    '',
    'JOB AD',
    input.jobText,
    '',
    'Produce the tailored summary, per-role highlights and cover-letter body paragraphs for this job.',
  ].join('\n');

  return { system, user };
}

/* ------------------------------------------------------------------------ */
/* Generate → guard → one repair → null                                      */
/* ------------------------------------------------------------------------ */

export async function tailorWithGuard(generate: GenerateFn, input: TailorInput): Promise<TailorResult | null> {
  const { system, user } = buildTailorPrompt(input);
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }];

  const first = await generate({ system, messages, schema: tailoredOutputSchema });
  if (!first.parsed) return null; // refusal or malformed — nothing to repair

  const check1 = checkClaims(first.parsed, input.profile, input.jobText);
  if (check1.ok) return { output: first.parsed, origin: 'live' };

  const repairMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: 'assistant', content: first.raw || JSON.stringify(first.parsed) },
    { role: 'user', content: buildRepairInstruction(check1.violations) },
  ];
  const second = await generate({ system, messages: repairMessages, schema: tailoredOutputSchema });
  if (!second.parsed) return null;

  const check2 = checkClaims(second.parsed, input.profile, input.jobText);
  if (check2.ok) return { output: second.parsed, origin: 'live-repaired' };

  return null;
}

/* ------------------------------------------------------------------------ */
/* Deterministic fallback (v1's generator logic, sans rendering)             */
/* ------------------------------------------------------------------------ */

/** "Role @ Company: highlight" → "highlight" (evidence strings carry a provenance prefix). */
function evidenceProse(evidence: string): string {
  const idx = evidence.indexOf(': ');
  return idx >= 0 ? evidence.slice(idx + 2) : evidence;
}

function endsWithPunctuation(s: string): boolean {
  return /[.!?]$/.test(s.trim());
}

function sentence(s: string): string {
  const t = s.trim();
  return endsWithPunctuation(t) ? t : `${t}.`;
}

/**
 * Cover-letter body paragraphs exactly as v1's generateCoverLetter built
 * them: an opening naming the role (and company when known), up to four
 * evidence paragraphs from strong/moderate matches, a generic evidence
 * paragraph when there are none, and a warm closing. Every figure comes
 * from the profile or verbatim evidence, so the result passes checkClaims.
 */
export function deterministicLetterParagraphs(input: TailorInput): string[] {
  const { analysis, profile } = input;
  const paragraphs: string[] = [];
  const years = profile.personal.years_experience;
  const company = input.job.company.trim() || analysis.company;
  const title = input.job.title.trim() || analysis.jobTitle;
  const knownCompany = company.length > 0 && company !== 'Target Company';

  paragraphs.push(
    `I am writing to express my strong interest in the ${title} position${knownCompany ? ` at ${company}` : ''}. With ${years}+ years of progressive experience, I bring a proven track record of delivering the strategic outcomes and operational excellence this role demands.`
  );

  const strongMatches = analysis.matches.filter((m) => m.matchStrength === 'strong' || m.matchStrength === 'moderate');
  for (const match of strongMatches.slice(0, 4)) {
    const top = match.evidence.slice(0, 3).map(evidenceProse);
    if (top.length === 0) continue;
    const category = match.requirement.category;
    const intro = match.matchStrength === 'strong' ? `In the area of ${category}, my track record includes: ` : `Regarding ${category}, my experience includes: `;
    paragraphs.push(intro + top.map(sentence).join(' '));
  }

  if (strongMatches.length === 0) {
    const all = analysis.matches.flatMap((m) => m.evidence).slice(0, 3).map(evidenceProse);
    if (all.length > 0) {
      paragraphs.push(`My experience directly aligns with the requirements of this role. ${all.map(sentence).join(' ')}`);
    }
  }

  paragraphs.push(
    `I am genuinely excited about the opportunity to bring my blend of hands-on technical delivery, strategic thinking and people leadership to ${knownCompany ? company : 'your organisation'}. I would welcome the chance to discuss how my experience can contribute to your team's success.`
  );

  return paragraphs;
}

/**
 * Fallback output built purely from the analyser: its tailored summary, its
 * per-role highlight selection (mapped back to the profile's exact
 * title/company strings, in profile order) and the v1 letter prose.
 */
export function deterministicTailored(input: TailorInput): TailoredOutput {
  const { analysis, profile } = input;
  // analyzeJob labels each block `${title} | ${company} (${dates})` in profile
  // order; match on the label first (a stored analysis may predate a profile
  // edit), then by position, then fall back to the role's own top highlights.
  const highlights = profile.career_history.map((role, i) => {
    const label = `${role.title} | ${role.company}`;
    const fromAnalysis = analysis.tailoredHighlights.find((h) => h.role.startsWith(label)) ?? analysis.tailoredHighlights[i];
    const bullets = fromAnalysis && fromAnalysis.highlights.length > 0 ? fromAnalysis.highlights : role.highlights.slice(0, 3);
    return { role: role.title, company: role.company, bullets };
  });
  return {
    summary: analysis.tailoredSummary,
    highlights,
    coverLetter: { paragraphs: deterministicLetterParagraphs(input) },
  };
}
