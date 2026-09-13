/**
 * Job analyser — keyword-driven, deterministic comparison of a job ad
 * against the user's career profile. Ported from v1 src/lib/job-analyzer.ts
 * with the interview-question generator removed (v2 has no interview flow)
 * and `matchBenefits` moved to ./benefits.ts.
 *
 * Nothing here calls an LLM. The output is the *evidence* the tailoring
 * prompt is allowed to cite: every evidence string is a verbatim highlight,
 * competency or certification from the profile, prefixed with where it came
 * from. `analysisEvidenceText` renders that as plain text for the prompt.
 *
 * Two deliberate departures from v1:
 *  - Keywords match on word boundaries. v1 used raw `includes`, so "restaurant"
 *    hit "rest", "maintain" hit "ai" and "html" hit "ml" — enough for a chef ad
 *    to score 100%.
 *  - `matchPercentage` is importance-weighted and scaled by keyword coverage:
 *    an ad that uses almost none of the engine's vocabulary (a chef ad with one
 *    incidental "cost") cannot report a high match just because its single
 *    spurious requirement happens to be evidenced. See `scoreMatches`.
 *
 * Pure: same (jobText, profile) → same result. No I/O, no clock, no random.
 */
import type { BenefitMatch, UserProfile } from '../types';
import { matchBenefits } from './benefits';

export interface JobRequirement {
  category: string;
  requirement: string;
  keywords: string[];
  importance: 'critical' | 'important' | 'nice-to-have';
}

export interface MatchResult {
  requirement: JobRequirement;
  matched: boolean;
  evidence: string[];
  matchStrength: 'strong' | 'moderate' | 'weak' | 'none';
}

export interface AnalysisResult {
  jobTitle: string;
  company: string;
  officeLocation: string;
  requirements: JobRequirement[];
  matches: MatchResult[];
  /** 0–100; importance-weighted share of evidenced requirements, scaled by keyword coverage. */
  matchPercentage: number;
  /** Distinct engine keywords found in the ad (the vocabulary the score is based on). */
  keywordsFound: string[];
  tailoredSummary: string;
  tailoredHighlights: { role: string; highlights: string[] }[];
  coverLetterPoints: string[];
  missingSkills: string[];
  recommendedCertifications: string[];
  benefitMatches: BenefitMatch[];
}

/** Optional facts already known from the alert email; override text heuristics. */
export interface AnalyzeJobHints {
  title?: string;
  company?: string;
}

export const KEYWORD_CATEGORIES: Record<string, string[]> = {
  'AI & Machine Learning': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'copilot', 'generative ai', 'llm', 'chatbot', 'nlp', 'agentic', 'agent'],
  'Cloud & Infrastructure': ['azure', 'aws', 'cloud', 'infrastructure', 'saas', 'paas', 'iaas', 'windows 365', 'cloud pc'],
  'Security & Compliance': ['security', 'zero trust', 'pam', 'privileged access', 'nist', 'iso', 'compliance', 'cyber', 'endpoint security', 'mfa', 'identity'],
  'Microsoft 365': ['m365', 'microsoft 365', 'office 365', 'intune', 'teams', 'sharepoint', 'exchange', 'endpoint manager', 'entra'],
  'DevOps & Engineering': ['devops', 'ci/cd', 'pipeline', 'github', 'automation', 'agile', 'scrum', 'sprint', 'backlog'],
  'Leadership & Strategy': ['leadership', 'strategy', 'roadmap', 'stakeholder', 'governance', 'director', 'head of', 'executive', 'senior'],
  'Data & Analytics': ['data', 'analytics', 'database', 'sql', 'reporting', 'kpi', 'metrics', 'insight'],
  'Product Management': ['product owner', 'product manager', 'backlog', 'user stories', 'mvp', 'customer experience', 'cx'],
  'Financial Management': ['budget', 'opex', 'capex', 'cost', 'financial', 'roi', 'forecast', 'licensing'],
  'Power Platform': ['power apps', 'power automate', 'power platform', 'copilot studio', 'dataverse'],
  'Integration & API': ['api', 'integration', 'rest', 'microservices', 'middleware', 'kafka'],
  'Risk & Governance': ['risk', 'governance', 'audit', 'cobit', 'itil', 'nzism', 'regulatory'],
};

/**
 * Certifications worth suggesting when a requirement category has no
 * evidence in the profile. v1 always returned `[]` here; this is the small
 * deterministic table that replaces the placeholder.
 */
const CATEGORY_CERTIFICATIONS: Record<string, string[]> = {
  'AI & Machine Learning': ['Microsoft Certified: Azure AI Fundamentals (AI-900)'],
  'Cloud & Infrastructure': ['Microsoft Certified: Azure Fundamentals (AZ-900)', 'AWS Certified Cloud Practitioner'],
  'Security & Compliance': ['Microsoft Certified: Security, Compliance, and Identity Fundamentals (SC-900)', 'CISSP'],
  'Microsoft 365': ['Microsoft 365 Certified: Fundamentals (MS-900)'],
  'DevOps & Engineering': ['Microsoft Certified: DevOps Engineer Expert (AZ-400)', 'Certified ScrumMaster (CSM)'],
  'Leadership & Strategy': ['TOGAF Enterprise Architecture Foundation'],
  'Data & Analytics': ['Microsoft Certified: Azure Data Fundamentals (DP-900)'],
  'Product Management': ['Professional Scrum Product Owner (PSPO I)'],
  'Financial Management': ['FinOps Certified Practitioner'],
  'Power Platform': ['Microsoft Certified: Power Platform Fundamentals (PL-900)'],
  'Integration & API': ['Microsoft Certified: Azure Developer Associate (AZ-204)'],
  'Risk & Governance': ['ITIL 4 Foundation', 'COBIT 2019 Foundation'],
};

const keywordRegexCache = new Map<string, RegExp>();

/** Case-insensitive whole-word test: "ai" matches "AI-ready" and "AI," but not "maintain". */
export function containsKeyword(text: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  let re = keywordRegexCache.get(kw);
  if (!re) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
    re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
    keywordRegexCache.set(kw, re);
  }
  return re.test(text);
}

export function extractKeywords(text: string): string[] {
  const found: string[] = [];
  for (const keywords of Object.values(KEYWORD_CATEGORIES)) {
    for (const kw of keywords) {
      if (containsKeyword(text, kw)) {
        found.push(kw);
      }
    }
  }
  return [...new Set(found)];
}

function categorizeKeyword(keyword: string): string {
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    if (keywords.includes(keyword.toLowerCase())) return category;
  }
  return 'Other';
}

export function extractJobInfo(text: string): { title: string; company: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = '';
  let company = '';

  for (const line of lines.slice(0, 20)) {
    const lower = line.toLowerCase();
    if (!title && (lower.includes('role') || lower.includes('position') || lower.includes('title') ||
        lower.match(/^(senior|head|director|manager|lead|chief|principal|vp)/))) {
      title = line.replace(/^(role|position|title|job)\s*[:–-]\s*/i, '').trim();
    }
    // v1 also tested `lower.match(/at\s+[A-Z]/)` here, which can never match a
    // lower-cased string; the dead branch is dropped rather than "fixed" so
    // mid-sentence "...at Microsoft..." lines are not mistaken for a company.
    if (!company && (lower.includes('company') || lower.includes('organisation') || lower.includes('organization'))) {
      company = line.replace(/^(company|organisation|organization)\s*[:–-]\s*/i, '').trim();
    }
  }

  if (!title) {
    const titleMatch = text.match(/(?:role|position|title|job)\s*[:–-]\s*([^\n]+)/i);
    if (titleMatch) title = titleMatch[1].trim();
  }

  return { title: title || 'Target Role', company: company || 'Target Company' };
}

export function analyzeJob(jobText: string, profile: UserProfile, hints: AnalyzeJobHints = {}): AnalysisResult {
  const extracted = extractJobInfo(jobText);
  const title = hints.title?.trim() || extracted.title;
  const company = hints.company?.trim() || extracted.company;
  const jobKeywords = extractKeywords(jobText);

  // Build requirements from job text
  const requirements: JobRequirement[] = [];
  const sentences = jobText.split(/[.!?\n]/).filter((s) => s.trim().length > 20);

  const seenCategories = new Set<string>();
  for (const kw of jobKeywords) {
    const cat = categorizeKeyword(kw);
    if (!seenCategories.has(cat)) {
      seenCategories.add(cat);
      const relatedKws = jobKeywords.filter((k) => categorizeKeyword(k) === cat);
      const relatedSentence = sentences.find((s) => relatedKws.some((k) => containsKeyword(s, k)));
      requirements.push({
        category: cat,
        requirement: relatedSentence?.trim() || `Experience with ${cat}`,
        keywords: relatedKws,
        importance: relatedKws.length > 2 ? 'critical' : relatedKws.length > 1 ? 'important' : 'nice-to-have',
      });
    }
  }

  // Match against profile
  const matches: MatchResult[] = requirements.map((req) => {
    const evidence: string[] = [];
    let matchStrength: MatchResult['matchStrength'] = 'none';

    for (const role of profile.career_history) {
      const roleKeywords = role.keywords.map((k) => k.toLowerCase());
      const overlap = req.keywords.filter((k) =>
        roleKeywords.some((rk) => rk.includes(k) || k.includes(rk))
      );

      if (overlap.length > 0) {
        for (const highlight of role.highlights) {
          if (req.keywords.some((k) => containsKeyword(highlight, k))) {
            evidence.push(`${role.title} @ ${role.company}: ${highlight}`);
          }
        }
      }
    }

    // Check competencies
    for (const comp of profile.core_competencies) {
      if (req.keywords.some((k) => containsKeyword(comp, k))) {
        evidence.push(`Core competency: ${comp}`);
      }
    }

    // Check certifications
    for (const cert of profile.certifications_and_training) {
      if (req.keywords.some((k) => containsKeyword(cert.name, k))) {
        evidence.push(`Certification: ${cert.name} (${cert.year})`);
      }
    }

    if (evidence.length >= 3) matchStrength = 'strong';
    else if (evidence.length >= 2) matchStrength = 'moderate';
    else if (evidence.length >= 1) matchStrength = 'weak';

    return { requirement: req, matched: evidence.length > 0, evidence, matchStrength };
  });

  const matchPercentage = scoreMatches(matches, jobKeywords);

  // Build tailored summary
  const topCategories = matches
    .filter((m) => m.matchStrength === 'strong' || m.matchStrength === 'moderate')
    .map((m) => m.requirement.category)
    .slice(0, 5);

  const tailoredSummary = buildTailoredSummary(title, company, topCategories, jobKeywords, profile);

  // Build tailored highlights per role
  const tailoredHighlights = profile.career_history.map((role) => {
    const relevant = role.highlights.filter((h) => jobKeywords.some((k) => containsKeyword(h, k)));
    const others = role.highlights.filter((h) => !relevant.includes(h));
    return {
      role: `${role.title} | ${role.company} (${role.start_date}–${role.end_date})`,
      highlights: [...relevant, ...others.slice(0, Math.max(3 - relevant.length, 1))],
    };
  });

  // Cover letter talking points
  const coverLetterPoints = buildCoverLetterPoints(matches);

  // Missing skills
  const missingSkills = matches
    .filter((m) => !m.matched)
    .map((m) => m.requirement.category);

  const recommendedCertifications = recommendCertifications(missingSkills, profile);

  const officeLocation = extractLocation(jobText);
  const benefitMatches = matchBenefits(jobText, profile.priority_benefits || []);

  return {
    jobTitle: title,
    company,
    officeLocation,
    requirements,
    matches,
    matchPercentage,
    keywordsFound: jobKeywords,
    tailoredSummary,
    tailoredHighlights,
    coverLetterPoints,
    missingSkills,
    recommendedCertifications,
    benefitMatches,
  };
}

const IMPORTANCE_WEIGHT: Record<JobRequirement['importance'], number> = {
  critical: 3,
  important: 2,
  'nice-to-have': 1,
};

const STRENGTH_VALUE: Record<MatchResult['matchStrength'], number> = {
  strong: 1,
  moderate: 0.75,
  weak: 0.5,
  none: 0,
};

/** Distinct keywords an ad must use before the score is reported at full confidence. */
export const FULL_CONFIDENCE_KEYWORDS = 6;

/**
 * 0–100. Each requirement contributes its importance weight; a matched one
 * earns that weight scaled by evidence strength. The ratio is then scaled by
 * keyword coverage (distinct keywords / FULL_CONFIDENCE_KEYWORDS, capped at
 * 1) so an ad that barely speaks the engine's vocabulary cannot score high.
 */
export function scoreMatches(matches: MatchResult[], keywords: string[]): number {
  if (matches.length === 0) return 0;
  let total = 0;
  let earned = 0;
  for (const m of matches) {
    const w = IMPORTANCE_WEIGHT[m.requirement.importance];
    total += w;
    earned += w * STRENGTH_VALUE[m.matchStrength];
  }
  const coverage = Math.min(1, keywords.length / FULL_CONFIDENCE_KEYWORDS);
  return Math.round((earned / total) * coverage * 100);
}

/**
 * Suggest certifications for categories the profile has no evidence for,
 * skipping any the user already holds (matched on a loose name comparison).
 */
export function recommendCertifications(missingCategories: string[], profile: UserProfile): string[] {
  const held = profile.certifications_and_training.map((c) => c.name.toLowerCase());
  const out: string[] = [];
  for (const cat of missingCategories) {
    for (const cert of CATEGORY_CERTIFICATIONS[cat] ?? []) {
      const certLower = cert.toLowerCase();
      const code = certLower.match(/\(([a-z]{2}-\d{3})\)/)?.[1];
      const alreadyHeld = held.some((h) => h === certLower || (code !== undefined && h.includes(code)));
      if (!alreadyHeld && !out.includes(cert)) out.push(cert);
    }
  }
  return out;
}

export function buildTailoredSummary(
  title: string,
  company: string,
  topCategories: string[],
  keywords: string[],
  profile: UserProfile
): string {
  const base = profile.executive_summary;
  const years = profile.personal.years_experience;

  // If we have no strong/moderate matched categories, return the base summary
  if (topCategories.length === 0) {
    return base || `Technology professional with ${years}+ years of experience seeking the ${title} role.`;
  }

  // Compose a dynamic summary from the profile's base summary + matched competencies
  const matchedCompetencies = profile.core_competencies.filter((c) =>
    keywords.some((k) => containsKeyword(c, k))
  );

  const competencyHighlight = matchedCompetencies.length > 0
    ? matchedCompetencies.slice(0, 4).join(', ')
    : topCategories.slice(0, 3).join(', ');

  // Use the executive summary as the foundation and append targeted context
  const baseSentence = base
    ? base.replace(/\.\s*$/, '')
    : `Experienced technology professional with ${years}+ years of progressive career growth`;

  const categoryPhrase = topCategories.slice(0, 3).join(', ');

  return `${baseSentence}. Brings ${years}+ years of demonstrated expertise in ${categoryPhrase}, with specific strengths in ${competencyHighlight}. Well-positioned to deliver impact in the ${title} role${company !== 'Target Company' ? ` at ${company}` : ''}.`;
}

const NZ_AU_CITIES = [
  'auckland', 'wellington', 'christchurch', 'hamilton', 'tauranga', 'dunedin',
  'queenstown', 'napier', 'hastings', 'palmerston north', 'nelson', 'rotorua',
  'new plymouth', 'whangarei', 'invercargill', 'lower hutt', 'upper hutt',
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra',
  'gold coast', 'hobart', 'darwin', 'newcastle', 'wollongong',
];

const LOCATION_PATTERNS = [
  /(?:based|located|office|position|role)\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+)/gi,
  /(?:in\s+)?((?:Auckland|Wellington|Christchurch|Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra)[^.]*)/gi,
];

export function extractLocation(text: string): string {
  const lower = text.toLowerCase();

  // Check for remote/hybrid first
  if (/fully\s+remote/i.test(text)) return 'Fully Remote';
  const hybridMatch = /hybrid.{0,30}(office|days)/i.test(text);

  // Search for city names
  for (const city of NZ_AU_CITIES) {
    if (lower.includes(city)) {
      const properCity = city.charAt(0).toUpperCase() + city.slice(1);
      return hybridMatch ? `${properCity} (Hybrid)` : properCity;
    }
  }

  // Try pattern matching
  for (const pattern of LOCATION_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) {
      const loc = match[1].trim().replace(/[,.]$/, '');
      if (loc.length > 2 && loc.length < 50) {
        return hybridMatch ? `${loc} (Hybrid)` : loc;
      }
    }
  }

  if (hybridMatch) return 'Hybrid (location not specified)';
  if (/work\s*from\s*home|wfh|remote/i.test(text)) return 'Remote / WFH mentioned';

  return 'Not specified';
}

function buildCoverLetterPoints(matches: MatchResult[]): string[] {
  const points: string[] = [];

  const strongMatches = matches.filter((m) => m.matchStrength === 'strong');
  const moderateMatches = matches.filter((m) => m.matchStrength === 'moderate');

  for (const match of strongMatches.slice(0, 3)) {
    const topEvidence = match.evidence[0];
    if (topEvidence) {
      points.push(topEvidence);
    }
  }

  for (const match of moderateMatches.slice(0, 2)) {
    const topEvidence = match.evidence[0];
    if (topEvidence) {
      points.push(topEvidence);
    }
  }

  return points;
}

/**
 * Render the analysis as the plain-text "fact sheet" the tailoring prompt is
 * allowed to draw on: who the candidate is, which job, which requirements
 * matched (with the verbatim profile evidence) and which did not. Anything
 * not in this text is not a fact the LLM may invent.
 */
export function analysisEvidenceText(analysis: AnalysisResult, profile: UserProfile): string {
  const lines: string[] = [];
  lines.push(`Candidate: ${profile.personal.name} (${profile.personal.years_experience}+ years experience)`);
  lines.push(`Job title: ${analysis.jobTitle}`);
  lines.push(`Company: ${analysis.company}`);
  lines.push(`Location: ${analysis.officeLocation}`);
  lines.push(`Requirement match: ${analysis.matchPercentage}%`);
  lines.push('');

  const matched = analysis.matches.filter((m) => m.matched);
  lines.push(`Matched requirements (${matched.length}):`);
  if (matched.length === 0) lines.push('  (none)');
  for (const m of matched) {
    lines.push(`- [${m.requirement.importance}, ${m.matchStrength}] ${m.requirement.category}: ${m.requirement.requirement}`);
    lines.push(`  Keywords: ${m.requirement.keywords.join(', ')}`);
    lines.push('  Evidence:');
    for (const e of m.evidence) lines.push(`    * ${e}`);
  }
  lines.push('');

  lines.push(`Missing / unevidenced requirements (${analysis.missingSkills.length}):`);
  if (analysis.missingSkills.length === 0) lines.push('  (none)');
  for (const s of analysis.missingSkills) lines.push(`- ${s}`);

  if (analysis.recommendedCertifications.length > 0) {
    lines.push('');
    lines.push('Certifications that would close the gaps:');
    for (const c of analysis.recommendedCertifications) lines.push(`- ${c}`);
  }

  return lines.join('\n');
}
