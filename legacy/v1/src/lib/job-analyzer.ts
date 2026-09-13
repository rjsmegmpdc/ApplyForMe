import type { UserProfile, BenefitMatch, InterviewQuestion } from "./types";

export interface JobRequirement {
  category: string;
  requirement: string;
  keywords: string[];
  importance: "critical" | "important" | "nice-to-have";
}

export interface MatchResult {
  requirement: JobRequirement;
  matched: boolean;
  evidence: string[];
  matchStrength: "strong" | "moderate" | "weak" | "none";
}

export interface AnalysisResult {
  jobTitle: string;
  company: string;
  officeLocation: string;
  requirements: JobRequirement[];
  matches: MatchResult[];
  matchPercentage: number;
  tailoredSummary: string;
  tailoredHighlights: { role: string; highlights: string[] }[];
  coverLetterPoints: string[];
  missingSkills: string[];
  recommendedCertifications: string[];
  benefitMatches: BenefitMatch[];
  interviewQuestions: InterviewQuestion[];
}

const KEYWORD_CATEGORIES: Record<string, string[]> = {
  "AI & Machine Learning": ["ai", "artificial intelligence", "machine learning", "ml", "copilot", "generative ai", "llm", "chatbot", "nlp", "agentic", "agent"],
  "Cloud & Infrastructure": ["azure", "aws", "cloud", "infrastructure", "saas", "paas", "iaas", "windows 365", "cloud pc"],
  "Security & Compliance": ["security", "zero trust", "pam", "privileged access", "nist", "iso", "compliance", "cyber", "endpoint security", "mfa", "identity"],
  "Microsoft 365": ["m365", "microsoft 365", "office 365", "intune", "teams", "sharepoint", "exchange", "endpoint manager", "entra"],
  "DevOps & Engineering": ["devops", "ci/cd", "pipeline", "github", "automation", "agile", "scrum", "sprint", "backlog"],
  "Leadership & Strategy": ["leadership", "strategy", "roadmap", "stakeholder", "governance", "director", "head of", "executive", "senior"],
  "Data & Analytics": ["data", "analytics", "database", "sql", "reporting", "kpi", "metrics", "insight"],
  "Product Management": ["product owner", "product manager", "backlog", "user stories", "mvp", "customer experience", "cx"],
  "Financial Management": ["budget", "opex", "capex", "cost", "financial", "roi", "forecast", "licensing"],
  "Power Platform": ["power apps", "power automate", "power platform", "copilot studio", "dataverse"],
  "Integration & API": ["api", "integration", "rest", "microservices", "middleware", "kafka"],
  "Risk & Governance": ["risk", "governance", "audit", "cobit", "itil", "nzism", "regulatory"],
};

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
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
  return "Other";
}

export function extractJobInfo(text: string): { title: string; company: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = "";
  let company = "";

  for (const line of lines.slice(0, 20)) {
    const lower = line.toLowerCase();
    if (!title && (lower.includes("role") || lower.includes("position") || lower.includes("title") ||
        lower.match(/^(senior|head|director|manager|lead|chief|principal|vp)/))) {
      title = line.replace(/^(role|position|title|job)\s*[:–-]\s*/i, "").trim();
    }
    if (!company && (lower.includes("company") || lower.includes("organisation") || lower.includes("organization") ||
        lower.match(/at\s+[A-Z]/))) {
      company = line.replace(/^(company|organisation|organization)\s*[:–-]\s*/i, "").trim();
    }
  }

  if (!title) {
    const titleMatch = text.match(/(?:role|position|title|job)\s*[:–-]\s*([^\n]+)/i);
    if (titleMatch) title = titleMatch[1].trim();
  }

  return { title: title || "Target Role", company: company || "Target Company" };
}

export function analyzeJob(jobText: string, profile: UserProfile): AnalysisResult {
  const { title, company } = extractJobInfo(jobText);
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
      const relatedSentence = sentences.find((s) => relatedKws.some((k) => s.toLowerCase().includes(k)));
      requirements.push({
        category: cat,
        requirement: relatedSentence?.trim() || `Experience with ${cat}`,
        keywords: relatedKws,
        importance: relatedKws.length > 2 ? "critical" : relatedKws.length > 1 ? "important" : "nice-to-have",
      });
    }
  }

  // Match against profile
  const matches: MatchResult[] = requirements.map((req) => {
    const evidence: string[] = [];
    let matchStrength: MatchResult["matchStrength"] = "none";

    for (const role of profile.career_history) {
      const roleKeywords = role.keywords.map((k) => k.toLowerCase());
      const overlap = req.keywords.filter((k) =>
        roleKeywords.some((rk) => rk.includes(k) || k.includes(rk))
      );

      if (overlap.length > 0) {
        for (const highlight of role.highlights) {
          const hlLower = highlight.toLowerCase();
          if (req.keywords.some((k) => hlLower.includes(k))) {
            evidence.push(`${role.title} @ ${role.company}: ${highlight}`);
          }
        }
      }
    }

    // Check competencies
    for (const comp of profile.core_competencies) {
      if (req.keywords.some((k) => comp.toLowerCase().includes(k))) {
        evidence.push(`Core competency: ${comp}`);
      }
    }

    // Check certifications
    for (const cert of profile.certifications_and_training) {
      if (req.keywords.some((k) => cert.name.toLowerCase().includes(k))) {
        evidence.push(`Certification: ${cert.name} (${cert.year})`);
      }
    }

    if (evidence.length >= 3) matchStrength = "strong";
    else if (evidence.length >= 2) matchStrength = "moderate";
    else if (evidence.length >= 1) matchStrength = "weak";

    return { requirement: req, matched: evidence.length > 0, evidence, matchStrength };
  });

  const matchPercentage = Math.round(
    (matches.filter((m) => m.matched).length / Math.max(matches.length, 1)) * 100
  );

  // Build tailored summary
  const topCategories = matches
    .filter((m) => m.matchStrength === "strong" || m.matchStrength === "moderate")
    .map((m) => m.requirement.category)
    .slice(0, 5);

  const tailoredSummary = buildTailoredSummary(title, company, topCategories, jobKeywords, profile);

  // Build tailored highlights per role
  const tailoredHighlights = profile.career_history.map((role) => {
    const relevant = role.highlights.filter((h) => {
      const hLower = h.toLowerCase();
      return jobKeywords.some((k) => hLower.includes(k));
    });
    const others = role.highlights.filter((h) => !relevant.includes(h));
    return {
      role: `${role.title} | ${role.company} (${role.start_date}–${role.end_date})`,
      highlights: [...relevant, ...others.slice(0, Math.max(3 - relevant.length, 1))],
    };
  });

  // Cover letter talking points
  const coverLetterPoints = buildCoverLetterPoints(matches, title, company);

  // Missing skills
  const missingSkills = matches
    .filter((m) => !m.matched)
    .map((m) => m.requirement.category);

  const officeLocation = extractLocation(jobText);
  const benefitMatches = matchBenefits(jobText, profile.priority_benefits || []);
  const interviewQuestions = generateInterviewQuestions(matches, profile.priority_benefits || []);

  return {
    jobTitle: title,
    company,
    officeLocation,
    requirements,
    matches,
    matchPercentage,
    tailoredSummary,
    tailoredHighlights,
    coverLetterPoints,
    missingSkills,
    recommendedCertifications: [],
    benefitMatches,
    interviewQuestions,
  };
}

function buildTailoredSummary(
  title: string,
  company: string,
  topCategories: string[],
  keywords: string[],
  profile: UserProfile
): string {
  const base = profile.executive_summary;
  const years = profile.years_experience ?? profile.personal.years_experience;

  // If we have no strong/moderate matched categories, return the base summary
  if (topCategories.length === 0) {
    return base || `Technology professional with ${years}+ years of experience seeking the ${title} role.`;
  }

  // Compose a dynamic summary from the profile's base summary + matched competencies
  const matchedCompetencies = profile.core_competencies.filter((c) =>
    keywords.some((k) => c.toLowerCase().includes(k))
  );

  const competencyHighlight = matchedCompetencies.length > 0
    ? matchedCompetencies.slice(0, 4).join(", ")
    : topCategories.slice(0, 3).join(", ");

  // Use the executive summary as the foundation and append targeted context
  const baseSentence = base
    ? base.replace(/\.\s*$/, "")
    : `Experienced technology professional with ${years}+ years of progressive career growth`;

  const categoryPhrase = topCategories.slice(0, 3).join(", ");

  return `${baseSentence}. Brings ${years}+ years of demonstrated expertise in ${categoryPhrase}, with specific strengths in ${competencyHighlight}. Well-positioned to deliver impact in the ${title} role${company !== "Target Company" ? ` at ${company}` : ""}.`;
}

const NZ_AU_CITIES = [
  "auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin",
  "queenstown", "napier", "hastings", "palmerston north", "nelson", "rotorua",
  "new plymouth", "whangarei", "invercargill", "lower hutt", "upper hutt",
  "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra",
  "gold coast", "hobart", "darwin", "newcastle", "wollongong",
];

const LOCATION_PATTERNS = [
  /(?:based|located|office|position|role)\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+)/gi,
  /(?:in\s+)?((?:Auckland|Wellington|Christchurch|Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra)[^.]*)/gi,
];

export function extractLocation(text: string): string {
  const lower = text.toLowerCase();

  // Check for remote/hybrid first
  if (/fully\s+remote/i.test(text)) return "Fully Remote";
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
      const loc = match[1].trim().replace(/[,.]$/, "");
      if (loc.length > 2 && loc.length < 50) {
        return hybridMatch ? `${loc} (Hybrid)` : loc;
      }
    }
  }

  if (hybridMatch) return "Hybrid (location not specified)";
  if (/work\s*from\s*home|wfh|remote/i.test(text)) return "Remote / WFH mentioned";

  return "Not specified";
}

export function matchBenefits(
  jobText: string,
  priorities: { keyword: string; priority: number }[]
): BenefitMatch[] {
  if (priorities.length === 0) return [];

  const sentences = jobText.split(/[.!?\n]/).filter((s) => s.trim().length > 10);
  const lower = jobText.toLowerCase();

  return priorities.map((p) => {
    const kw = p.keyword.toLowerCase();
    const found = lower.includes(kw);
    let context = "";

    if (found) {
      const matchingSentence = sentences.find((s) => s.toLowerCase().includes(kw));
      context = matchingSentence?.trim().slice(0, 200) || `"${p.keyword}" mentioned in job description`;
    }

    return { keyword: p.keyword, priority: p.priority, found, context };
  });
}

export function generateInterviewQuestions(
  matches: MatchResult[],
  priorities: { keyword: string; priority: number }[]
): InterviewQuestion[] {
  const questions: InterviewQuestion[] = [];
  let order = 0;

  // 1. Role Basics (always)
  questions.push(
    { questionKey: "location", question: "Can you confirm the role location — is it office-based, hybrid, or remote?", category: "basics" },
    { questionKey: "hiring_manager", question: "Who is the hiring manager for this position?", category: "basics" },
    { questionKey: "team_size", question: "What's the team size and reporting structure?", category: "basics" },
  );

  // 2. Compensation (always)
  questions.push(
    { questionKey: "salary_band", question: "What is the salary band for this role?", category: "compensation" },
  );
  if (priorities.length > 0) {
    const topBenefits = priorities.slice(0, 3).map((p) => p.keyword).join(", ");
    questions.push({
      questionKey: "benefits",
      question: `Are ${topBenefits} included in the benefits package?`,
      category: "compensation",
    });
  }

  // 3. Role-Specific (based on matched categories)
  const matchedCategories = matches.filter((m) => m.matched).map((m) => m.requirement.category);
  if (matchedCategories.includes("AI & Machine Learning")) {
    questions.push({ questionKey: "ai_stack", question: "What AI tools and platforms is the team currently using?", category: "role_specific" });
  }
  if (matchedCategories.includes("Security & Compliance")) {
    questions.push({ questionKey: "security_frameworks", question: "What security frameworks does the organisation follow (NIST, ISO, etc.)?", category: "role_specific" });
  }
  if (matchedCategories.includes("Cloud & Infrastructure")) {
    questions.push({ questionKey: "cloud_platforms", question: "What cloud platforms are in use and what's the migration maturity?", category: "role_specific" });
  }
  if (matchedCategories.includes("Leadership & Strategy")) {
    questions.push({ questionKey: "direct_reports", question: "How many direct reports does this role have and what are the current team capabilities?", category: "role_specific" });
  }

  // 4. Culture
  questions.push(
    { questionKey: "typical_week", question: "What does a typical week look like in this role?", category: "culture" },
    { questionKey: "challenges", question: "What are the biggest challenges the team is facing right now?", category: "culture" },
    { questionKey: "success_6m", question: "What does success look like in the first 6 months?", category: "culture" },
  );

  // 5. Process
  questions.push(
    { questionKey: "next_steps", question: "What are the next steps in the interview process?", category: "process" },
    { questionKey: "timeline", question: "What is the timeline for filling this role?", category: "process" },
  );

  return questions;
}

function buildCoverLetterPoints(matches: MatchResult[], title: string, company: string): string[] {
  const points: string[] = [];

  const strongMatches = matches.filter((m) => m.matchStrength === "strong");
  const moderateMatches = matches.filter((m) => m.matchStrength === "moderate");

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
