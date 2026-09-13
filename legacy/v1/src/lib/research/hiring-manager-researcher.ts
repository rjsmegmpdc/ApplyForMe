import type { HiringManagerResearch } from "../types";

export function buildHiringManagerResearch(
  name: string,
  company: string,
  jobTitle: string,
  searchResults?: string
): HiringManagerResearch {
  if (!searchResults) {
    return {
      name,
      linkedinSummary: `Research pending for ${name} at ${company}. Search LinkedIn, industry publications, and conference speaker lists.`,
      articles: [],
      conferences: [],
      knownDrivers: [],
      recommendedApproach: `Prepare by researching ${name}'s background on LinkedIn and any published articles or conference talks. Look for themes in their work that align with the ${jobTitle} role requirements.`,
    };
  }

  const lower = searchResults.toLowerCase();

  // Extract LinkedIn-style summary
  const linkedinSummary = extractSummary(searchResults, name);

  // Extract articles
  const articles = extractArticles(searchResults, name);

  // Extract conference mentions
  const conferences = extractConferences(searchResults);

  // Extract themes/drivers
  const knownDrivers = extractDrivers(searchResults);

  // Generate recommended approach
  const recommendedApproach = generateApproach(name, knownDrivers, jobTitle);

  return {
    name,
    linkedinSummary,
    articles,
    conferences,
    knownDrivers,
    recommendedApproach,
  };
}

function extractSummary(text: string, name: string): string {
  const sentences = text.split(/[.!?\n]/).filter((s) => s.trim().length > 20);
  const relevant = sentences.filter(
    (s) => s.toLowerCase().includes(name.toLowerCase().split(" ")[0])
  );
  return relevant.slice(0, 3).join(". ").trim() || `Profile information found for ${name}.`;
}

function extractArticles(
  text: string,
  name: string
): { title: string; url: string; snippet: string }[] {
  const articles: { title: string; url: string; snippet: string }[] = [];

  // Look for URL patterns
  const urlPattern = /https?:\/\/[^\s)>"]+/gi;
  const urls = text.match(urlPattern) || [];

  const sentences = text.split(/[.!?\n]/).filter((s) => s.trim().length > 30);

  for (const url of urls.slice(0, 5)) {
    const context = sentences.find((s) => s.includes(url));
    if (context) {
      articles.push({
        title: context.replace(url, "").trim().slice(0, 100) || "Article",
        url,
        snippet: context.trim().slice(0, 200),
      });
    }
  }

  // Also look for article-like mentions without URLs
  const articleKeywords = ["wrote", "published", "authored", "presented", "spoke about", "blog post", "article"];
  for (const kw of articleKeywords) {
    const matching = sentences.filter(
      (s) => s.toLowerCase().includes(kw) && !articles.some((a) => a.snippet.includes(s))
    );
    for (const s of matching.slice(0, 2)) {
      articles.push({ title: s.trim().slice(0, 100), url: "", snippet: s.trim() });
    }
  }

  return articles.slice(0, 5);
}

function extractConferences(text: string): string[] {
  const confKeywords = [
    "conference", "summit", "keynote", "speaker", "panelist",
    "webinar", "meetup", "tech talk", "ignite", "build",
  ];
  const sentences = text.split(/[.!?\n]/).filter((s) => s.trim().length > 15);
  return sentences
    .filter((s) => confKeywords.some((k) => s.toLowerCase().includes(k)))
    .map((s) => s.trim())
    .slice(0, 5);
}

function extractDrivers(text: string): string[] {
  const themes: Record<string, string[]> = {
    "AI & Automation": ["ai", "artificial intelligence", "automation", "machine learning", "copilot"],
    "Security & Zero Trust": ["security", "zero trust", "cyber", "nist", "compliance"],
    "Cloud Transformation": ["cloud", "azure", "aws", "migration", "modernisation"],
    "Agile & DevOps": ["agile", "devops", "ci/cd", "lean", "continuous"],
    "People & Culture": ["culture", "team", "leadership", "diversity", "talent"],
    "Customer Experience": ["customer", "cx", "ux", "experience", "digital"],
    "Data & Analytics": ["data", "analytics", "insight", "metrics", "intelligence"],
    "Cost Optimisation": ["cost", "efficiency", "opex", "savings", "optimisation"],
  };

  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const [theme, keywords] of Object.entries(themes)) {
    const matches = keywords.filter((k) => lower.includes(k));
    if (matches.length >= 2) found.push(theme);
  }

  return found;
}

function generateApproach(name: string, drivers: string[], jobTitle: string): string {
  if (drivers.length === 0) {
    return `Research ${name}'s LinkedIn profile and recent activity to identify their priorities. Align your pitch for the ${jobTitle} role to their known interests.`;
  }

  const driverList = drivers.slice(0, 3).join(", ");
  return `${name} appears to be focused on ${driverList}. When discussing the ${jobTitle} role, emphasise your experience in these areas. Lead with concrete outcomes and metrics that demonstrate impact in their priority domains.`;
}
