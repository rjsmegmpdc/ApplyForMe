import type { UserProfile, CompanyResearch, SalaryResearch, RecruiterBriefing } from "../types";
import type { AnalysisResult } from "../job-analyzer";
import { generateTalkingPoints } from "./company-researcher";

/**
 * Combines job analysis, user profile, company research, and salary data
 * into a single RecruiterBriefing object ready for display or export.
 */
export function generateBriefingContent(
  analysis: AnalysisResult,
  profile: UserProfile,
  company: CompanyResearch,
  salary: SalaryResearch
): RecruiterBriefing {
  const talkingPoints = generateTalkingPoints(analysis, company);
  const matchSummary = buildMatchSummary(analysis, profile);
  const gapAreas = buildGapAreas(analysis);

  return {
    company,
    salary,
    talkingPoints,
    matchSummary,
    gapAreas,
  };
}

/**
 * Builds a match summary string highlighting the top 3 strengths
 * from the analysis, contextualised with the candidate's profile.
 */
function buildMatchSummary(analysis: AnalysisResult, profile: UserProfile): string {
  const strongMatches = analysis.matches
    .filter((m) => m.matchStrength === "strong")
    .slice(0, 3);

  const moderateMatches = analysis.matches
    .filter((m) => m.matchStrength === "moderate")
    .slice(0, 3 - strongMatches.length);

  const topMatches = [...strongMatches, ...moderateMatches].slice(0, 3);

  if (topMatches.length === 0) {
    return `${profile.personal.name} brings ${profile.personal.years_experience}+ years of technology leadership experience. While specific keyword matches are limited, broad experience across the technology landscape provides a strong foundation for the ${analysis.jobTitle} role at ${analysis.company}.`;
  }

  const strengthDescriptions = topMatches.map((match) => {
    const category = match.requirement.category;
    const evidenceCount = match.evidence.length;
    const strength = match.matchStrength === "strong" ? "deep" : "solid";
    return `${strength} experience in ${category} (${evidenceCount} evidence points)`;
  });

  const strengthList = strengthDescriptions.join("; ");

  return `${profile.personal.name} is a strong candidate for the ${analysis.jobTitle} role at ${analysis.company} with a ${analysis.matchPercentage}% requirement match. Key strengths include: ${strengthList}. With ${profile.personal.years_experience}+ years of progressive technology leadership, the profile demonstrates consistent delivery across the core competencies required for this position.`;
}

/**
 * Extracts gap areas from the analysis - skills or categories
 * where the candidate did not have a match.
 */
function buildGapAreas(analysis: AnalysisResult): string[] {
  const gaps: string[] = [];

  // Unmatched requirements
  const unmatched = analysis.matches.filter((m) => !m.matched);
  for (const match of unmatched) {
    gaps.push(
      `${match.requirement.category}: ${match.requirement.requirement}`
    );
  }

  // Weak matches are also worth flagging
  const weakMatches = analysis.matches.filter(
    (m) => m.matched && m.matchStrength === "weak"
  );
  for (const match of weakMatches) {
    gaps.push(
      `${match.requirement.category} (limited evidence): ${match.requirement.requirement}`
    );
  }

  // Include any missing skills identified by the analyzer
  for (const skill of analysis.missingSkills) {
    const alreadyListed = gaps.some(
      (g) => g.toLowerCase().includes(skill.toLowerCase())
    );
    if (!alreadyListed) {
      gaps.push(`${skill}: No direct match found in profile`);
    }
  }

  return gaps;
}
