import type { CompanyResearch } from "../types";
import type { AnalysisResult } from "../job-analyzer";

/**
 * Builds a CompanyResearch object from optional search results text.
 * If searchResults are provided, attempts to extract structured data via simple pattern matching.
 * Otherwise returns a template with placeholder values.
 */
export function buildCompanyResearch(
  companyName: string,
  jobTitle: string,
  searchResults?: string
): CompanyResearch {
  if (!searchResults) {
    return {
      companyName,
      industry: "Pending research",
      employeeCount: "Pending research",
      headquarters: "Pending research",
      officeLocations: [],
      roleLocation: "Pending research",
      overview: "Pending research",
      cultureSummary: "Pending research",
      remoteWorkPolicy: "Pending research",
      wfhResistance: "unknown",
      recentNews: [],
      glassdoorRating: "Pending research",
    };
  }

  const textLower = searchResults.toLowerCase();

  return {
    companyName,
    industry: extractIndustry(textLower),
    employeeCount: extractEmployeeCount(searchResults),
    headquarters: extractHeadquarters(searchResults),
    officeLocations: extractOfficeLocations(textLower),
    roleLocation: "",
    overview: extractOverview(searchResults, companyName),
    cultureSummary: extractCultureSummary(textLower),
    remoteWorkPolicy: extractRemotePolicy(textLower),
    wfhResistance: classifyWfhResistance(textLower),
    recentNews: extractRecentNews(searchResults),
    glassdoorRating: extractGlassdoorRating(searchResults),
  };
}

function extractIndustry(text: string): string {
  const industryPatterns: [RegExp, string][] = [
    [/\b(fintech|financial\s+technology)\b/, "Financial Technology"],
    [/\b(financial\s+services|banking|bank)\b/, "Financial Services"],
    [/\b(telco|telecommunications|telecom)\b/, "Telecommunications"],
    [/\b(health\s*tech|healthcare|health\s+technology)\b/, "Healthcare / HealthTech"],
    [/\b(government|public\s+sector|govt)\b/, "Government / Public Sector"],
    [/\b(insurance|insur\s*tech)\b/, "Insurance"],
    [/\b(retail|e-?commerce)\b/, "Retail / E-Commerce"],
    [/\b(energy|utilities|power)\b/, "Energy / Utilities"],
    [/\b(education|ed\s*tech)\b/, "Education"],
    [/\b(media|entertainment|publishing)\b/, "Media / Entertainment"],
    [/\b(saas|software\s+as\s+a\s+service|software\s+company)\b/, "Software / SaaS"],
    [/\b(consulting|professional\s+services)\b/, "Consulting / Professional Services"],
    [/\b(logistics|transport|freight)\b/, "Logistics / Transport"],
    [/\b(agriculture|agri\s*tech|farming)\b/, "Agriculture / AgriTech"],
  ];

  for (const [pattern, label] of industryPatterns) {
    if (pattern.test(text)) {
      return label;
    }
  }

  return "Technology";
}

function extractEmployeeCount(text: string): string {
  // Match patterns like "5,000 employees", "~200 staff", "over 10000 people"
  const employeeMatch = text.match(
    /(?:(?:approximately|about|around|over|~)\s*)?(\d[\d,]*)\s*(?:\+\s*)?(?:employees|staff|people|team\s+members)/i
  );
  if (employeeMatch) {
    return employeeMatch[0].trim();
  }

  // Match patterns like "employee count: 500"
  const countMatch = text.match(
    /employee\s*(?:count|size|number)\s*[:=]\s*(\d[\d,]*)/i
  );
  if (countMatch) {
    return countMatch[1];
  }

  return "Not specified";
}

function extractHeadquarters(text: string): string {
  // Match patterns like "headquartered in Auckland" or "HQ: Wellington"
  const hqPatterns = [
    /headquartered\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\n|$)/,
    /(?:hq|headquarters|head\s+office)\s*[:=]\s*([A-Z][A-Za-z\s,]+?)(?:\.|,|\n|$)/i,
    /based\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\n|$)/,
  ];

  for (const pattern of hqPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return "Not specified";
}

function extractOverview(text: string, companyName: string): string {
  // Try to find the first sentence or two that mention the company name
  const sentences = text.split(/(?<=[.!?])\s+/);
  const relevant = sentences.filter(
    (s) =>
      s.toLowerCase().includes(companyName.toLowerCase()) && s.length > 30
  );

  if (relevant.length > 0) {
    // Return up to first 2 relevant sentences, capped at 300 chars
    const overview = relevant.slice(0, 2).join(" ");
    return overview.length > 300 ? overview.substring(0, 297) + "..." : overview;
  }

  // Fallback: return first substantive sentence
  const firstSubstantive = sentences.find((s) => s.length > 40);
  if (firstSubstantive) {
    return firstSubstantive.length > 300
      ? firstSubstantive.substring(0, 297) + "..."
      : firstSubstantive;
  }

  return `${companyName} - overview pending further research.`;
}

function extractCultureSummary(text: string): string {
  const cultureKeywords = [
    "culture",
    "values",
    "mission",
    "work environment",
    "team",
    "collaborative",
    "innovative",
    "diverse",
    "inclusive",
    "agile",
  ];

  const sentences = text.split(/(?<=[.!?])\s+/);
  const cultureSentences = sentences.filter((s) =>
    cultureKeywords.some((kw) => s.toLowerCase().includes(kw))
  );

  if (cultureSentences.length > 0) {
    const summary = cultureSentences.slice(0, 2).join(" ");
    return summary.length > 300 ? summary.substring(0, 297) + "..." : summary;
  }

  return "Culture information not found in available data.";
}

function extractRemotePolicy(text: string): string {
  const remotePatterns: [RegExp, string][] = [
    [/fully\s+remote/, "Fully remote"],
    [/remote[- ]first/, "Remote-first"],
    [/hybrid\s+(?:work|model|arrangement)/, "Hybrid working model"],
    [/(?:flexible|flex)\s+(?:work|arrangement|location)/, "Flexible working arrangements"],
    [/work\s+from\s+(?:home|anywhere)/, "Work from home available"],
    [/(?:return|back)\s+to\s+(?:the\s+)?office/, "Office-based (return to office)"],
    [/office[- ](?:based|first|centric)/, "Office-based"],
    [/(?:in[- ]office|on[- ]site)\s+(?:\d|required|mandatory|expected)/, "In-office required"],
  ];

  for (const [pattern, label] of remotePatterns) {
    if (pattern.test(text)) {
      return label;
    }
  }

  return "Not specified";
}

function classifyWfhResistance(text: string): CompanyResearch["wfhResistance"] {
  const lowResistance = [
    "fully remote",
    "remote-first",
    "remote first",
    "work from anywhere",
    "distributed team",
    "location independent",
  ];
  const moderateResistance = [
    "hybrid",
    "flexible work",
    "flexible location",
    "2-3 days",
    "3 days in office",
    "mix of remote",
  ];
  const highResistance = [
    "return to office",
    "office-based",
    "office based",
    "in-office required",
    "on-site required",
    "5 days in office",
    "full time in office",
    "office first",
    "office-first",
    "office centric",
  ];

  for (const phrase of highResistance) {
    if (text.includes(phrase)) return "high";
  }
  for (const phrase of moderateResistance) {
    if (text.includes(phrase)) return "moderate";
  }
  for (const phrase of lowResistance) {
    if (text.includes(phrase)) return "low";
  }

  return "unknown";
}

function extractRecentNews(text: string): string[] {
  const news: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  const newsKeywords = [
    "announced",
    "launched",
    "acquired",
    "raised",
    "partnership",
    "expanded",
    "opened",
    "hired",
    "appointed",
    "revenue",
    "growth",
    "funding",
    "ipo",
    "merger",
  ];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (newsKeywords.some((kw) => lower.includes(kw)) && sentence.length > 20) {
      const trimmed =
        sentence.length > 200 ? sentence.substring(0, 197) + "..." : sentence;
      news.push(trimmed.trim());
      if (news.length >= 5) break;
    }
  }

  return news;
}

function extractOfficeLocations(text: string): string[] {
  const cities = [
    "auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin",
    "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra",
  ];
  return cities
    .filter((c) => text.includes(c))
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1));
}

function extractGlassdoorRating(text: string): string {
  const ratingMatch = text.match(
    /(?:glassdoor|rating)\s*[:=]?\s*(\d(?:\.\d)?)\s*(?:\/\s*5|out\s+of\s+5|stars?)?/i
  );
  if (ratingMatch) {
    return `${ratingMatch[1]}/5`;
  }

  return "Not available";
}

/**
 * Generates suggested talking points for a recruiter call based on the
 * job analysis and company research.
 */
export function generateTalkingPoints(
  analysis: AnalysisResult,
  company: CompanyResearch
): string[] {
  const points: string[] = [];

  // Questions based on gap areas (skills not matched)
  if (analysis.missingSkills.length > 0) {
    const topGaps = analysis.missingSkills.slice(0, 2);
    for (const gap of topGaps) {
      points.push(
        `How critical is ${gap} experience for this role, and is there opportunity to develop in this area?`
      );
    }
  }

  // Questions based on the role itself
  points.push(
    `What is the team size and structure reporting to the ${analysis.jobTitle}?`
  );
  points.push(
    "What does the current technology stack look like, and are there any planned migrations or transformations?"
  );

  // Questions based on company research
  if (company.wfhResistance === "unknown" || company.remoteWorkPolicy === "Not specified") {
    points.push(
      "What is the company's current approach to flexible/hybrid working arrangements?"
    );
  }

  points.push(
    "What is the budget and headcount trajectory for the team over the next 12 months?"
  );
  points.push(
    "Who does this role report to, and what is the leadership team structure?"
  );
  points.push(
    "What does success look like in the first 6-12 months for this position?"
  );
  points.push(
    "What are the main growth plans or strategic initiatives this role will contribute to?"
  );

  // Keep to 5-7 points
  return points.slice(0, 7);
}
