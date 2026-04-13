/**
 * Web scraper for company research.
 *
 * Strategy:
 * 1. Discover the company's homepage (try common TLDs, follow redirects)
 * 2. Crawl the homepage to find links to About, Team, Leadership, Careers pages
 * 3. Scrape each discovered page for structured content
 * 4. Extract leadership names, company overview, culture signals, WFH policy
 */

const FETCH_TIMEOUT = 8000;
const MAX_BODY = 100000; // 100KB text limit per page

interface ScrapedPage {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
  links: { href: string; text: string }[];
}

interface CompanyScrapedData {
  homepage: ScrapedPage | null;
  aboutPage: ScrapedPage | null;
  teamPage: ScrapedPage | null;
  careersPage: ScrapedPage | null;
  allText: string;
  leaders: { name: string; title: string }[];
  discoveredUrl: string;
}

// ─── HTML Parsing ───

function extractFromHtml(html: string, baseUrl: string): ScrapedPage {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  const metaDescription =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1]?.trim() ||
    "";

  // Extract headings
  const headings: string[] = [];
  const headingRegex = /<h[1-3][^>]*>([^<]*(?:<[^/h][^>]*>[^<]*)*)<\/h[1-3]>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    const text = hMatch[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 2 && text.length < 200) headings.push(text);
  }

  // Extract links
  const links: { href: string; text: string }[] = [];
  const linkRegex = /<a[^>]*href=["']([^"'#]+)["'][^>]*>([^<]*(?:<[^/a][^>]*>[^<]*)*)<\/a>/gi;
  let lMatch;
  while ((lMatch = linkRegex.exec(html)) !== null) {
    const href = resolveUrl(lMatch[1].trim(), baseUrl);
    const text = lMatch[2].replace(/<[^>]+>/g, "").trim();
    if (href && text.length > 1 && text.length < 100) {
      links.push({ href, text });
    }
  }

  // Extract body text (strip scripts, styles, nav, footer, header)
  let bodyText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (bodyText.length > MAX_BODY) bodyText = bodyText.slice(0, MAX_BODY);

  return { url: baseUrl, title, metaDescription, headings, bodyText, links };
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return "https:" + href;
    if (href.startsWith("/")) {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${href}`;
    }
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

// ─── Fetching ───

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-NZ,en;q=0.9",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) return null;

    return await res.text();
  } catch {
    return null;
  }
}

// ─── Homepage Discovery ───

const TLDS = [
  ".co.nz", ".com", ".com.au", ".nz", ".io", ".net", ".org",
];

function buildCandidateUrls(companyName: string): string[] {
  const clean = companyName
    .toLowerCase()
    .replace(/\s+(ltd|limited|inc|corp|pty|nz|au|group|holdings|new zealand|australia)\.?$/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

  const slug = clean.replace(/\s+/g, "");
  const hyphenSlug = clean.replace(/\s+/g, "-");

  const urls: string[] = [];
  for (const tld of TLDS) {
    urls.push(`https://www.${slug}${tld}`);
    if (slug !== hyphenSlug) urls.push(`https://www.${hyphenSlug}${tld}`);
    urls.push(`https://${slug}${tld}`);
  }
  return urls;
}

async function discoverHomepage(companyName: string): Promise<{ url: string; html: string } | null> {
  const candidates = buildCandidateUrls(companyName);

  for (const url of candidates) {
    const html = await fetchPage(url);
    if (html && html.length > 500) {
      // Verify it's actually the right company (title/content should mention the company)
      const lower = html.toLowerCase();
      const nameParts = companyName.toLowerCase().split(/\s+/);
      const firstWord = nameParts[0];
      if (firstWord && lower.includes(firstWord)) {
        return { url, html };
      }
    }
  }

  return null;
}

// ─── Page Discovery (About, Team, Careers) ───

const ABOUT_PATTERNS = /\b(about|about-us|about_us|who-we-are|our-story|company)\b/i;
const TEAM_PATTERNS = /\b(team|leadership|leaders|people|executive|management|board|who-we-are|our-people|our-team)\b/i;
const CAREERS_PATTERNS = /\b(careers|jobs|work-with-us|join-us|opportunities|vacancies)\b/i;

function findPageUrl(
  links: { href: string; text: string }[],
  pattern: RegExp,
  baseHost: string
): string | null {
  // First try matching link text
  for (const link of links) {
    if (pattern.test(link.text) && isSameHost(link.href, baseHost)) {
      return link.href;
    }
  }
  // Then try matching URL path
  for (const link of links) {
    if (pattern.test(link.href) && isSameHost(link.href, baseHost)) {
      return link.href;
    }
  }
  return null;
}

function isSameHost(url: string, host: string): boolean {
  try {
    return new URL(url).host.includes(host.replace("www.", ""));
  } catch {
    return false;
  }
}

// ─── Leadership Extraction ───

function extractLeaders(pages: ScrapedPage[]): { name: string; title: string }[] {
  const leaders: { name: string; title: string }[] = [];
  const titlePatterns = /\b(CEO|CTO|CIO|CFO|COO|CISO|Chief|Director|Head of|VP|Vice President|General Manager|Managing Director|Partner|Founder|President)\b/i;

  for (const page of pages) {
    const text = page.bodyText;
    const sentences = text.split(/[.|\n]/).filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      if (!titlePatterns.test(sentence)) continue;

      // Look for "Name, Title" or "Name - Title" patterns
      const nameTitle = sentence.match(
        /([A-Z][a-z]+ (?:[A-Z]\.?\s*)?[A-Z][a-z]+)[\s,–-]+(?:is\s+(?:the\s+)?)?([A-Z][^,.]{5,60})/
      );
      if (nameTitle) {
        leaders.push({
          name: nameTitle[1].trim(),
          title: nameTitle[2].trim().replace(/\s+/g, " "),
        });
      }
    }

    // Also check headings for names with titles
    for (let i = 0; i < page.headings.length - 1; i++) {
      const heading = page.headings[i];
      const next = page.headings[i + 1];
      if (heading && next) {
        // Pattern: heading is name, next heading is title
        if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(heading) && titlePatterns.test(next)) {
          leaders.push({ name: heading, title: next });
        }
        // Reverse: title then name
        if (titlePatterns.test(heading) && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(next)) {
          leaders.push({ name: next, title: heading });
        }
      }
    }
  }

  // Dedupe by name
  const seen = new Set<string>();
  return leaders.filter((l) => {
    const key = l.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main Export ───

export async function scrapeCompany(companyName: string): Promise<CompanyScrapedData> {
  const result: CompanyScrapedData = {
    homepage: null,
    aboutPage: null,
    teamPage: null,
    careersPage: null,
    allText: "",
    leaders: [],
    discoveredUrl: "",
  };

  // Step 1: Find the homepage
  const home = await discoverHomepage(companyName);
  if (!home) return result;

  result.discoveredUrl = home.url;
  const homePage = extractFromHtml(home.html, home.url);
  result.homepage = homePage;

  const baseHost = new URL(home.url).host;

  // Step 2: Discover about, team, careers pages from homepage links
  const aboutUrl = findPageUrl(homePage.links, ABOUT_PATTERNS, baseHost);
  const teamUrl = findPageUrl(homePage.links, TEAM_PATTERNS, baseHost);
  const careersUrl = findPageUrl(homePage.links, CAREERS_PATTERNS, baseHost);

  // Step 3: Fetch discovered pages in parallel
  const [aboutHtml, teamHtml, careersHtml] = await Promise.all([
    aboutUrl ? fetchPage(aboutUrl) : null,
    teamUrl ? fetchPage(teamUrl) : null,
    careersUrl ? fetchPage(careersUrl) : null,
  ]);

  if (aboutHtml) result.aboutPage = extractFromHtml(aboutHtml, aboutUrl!);
  if (teamHtml) result.teamPage = extractFromHtml(teamHtml, teamUrl!);
  if (careersHtml) result.careersPage = extractFromHtml(careersHtml, careersUrl!);

  // If no about page found, try common paths directly
  if (!result.aboutPage) {
    for (const path of ["/about", "/about-us", "/our-story", "/company"]) {
      const url = `${home.url.replace(/\/$/, "")}${path}`;
      const html = await fetchPage(url);
      if (html && html.length > 500) {
        result.aboutPage = extractFromHtml(html, url);
        break;
      }
    }
  }

  // If no team page found, try common paths
  if (!result.teamPage) {
    for (const path of ["/team", "/leadership", "/our-team", "/people", "/about/leadership"]) {
      const url = `${home.url.replace(/\/$/, "")}${path}`;
      const html = await fetchPage(url);
      if (html && html.length > 500) {
        result.teamPage = extractFromHtml(html, url);
        break;
      }
    }
  }

  // Step 4: Combine all text
  const pages = [result.homepage, result.aboutPage, result.teamPage, result.careersPage].filter(
    Boolean
  ) as ScrapedPage[];

  result.allText = pages
    .map((p) => `[${p.url}]\nTitle: ${p.title}\n${p.metaDescription}\n${p.bodyText}`)
    .join("\n\n---\n\n");

  // Step 5: Extract leaders from team/about pages
  result.leaders = extractLeaders(pages);

  return result;
}

/**
 * Scrape LinkedIn public profile for a person.
 * LinkedIn heavily blocks scraping — this tries the public profile URL
 * and falls back gracefully.
 */
export async function scrapeLinkedIn(
  personName: string,
  companyName?: string
): Promise<{ text: string; profileUrl: string }> {
  const nameSlug = personName.toLowerCase().replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, "-");

  const urls = [
    `https://nz.linkedin.com/in/${nameSlug}`,
    `https://au.linkedin.com/in/${nameSlug}`,
    `https://www.linkedin.com/in/${nameSlug}`,
  ];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (html && html.length > 1000) {
      const page = extractFromHtml(html, url);
      // Check it's actually the right person
      const nameParts = personName.toLowerCase().split(/\s+/);
      const hasName = nameParts.some((p) => page.bodyText.toLowerCase().includes(p));
      const hasCompany = companyName
        ? page.bodyText.toLowerCase().includes(companyName.toLowerCase().split(/\s+/)[0])
        : true;

      if (hasName) {
        return {
          text: `LinkedIn Profile: ${page.title}\n${page.metaDescription}\n\n${page.bodyText.slice(0, 3000)}`,
          profileUrl: url,
        };
      }
    }
  }

  return { text: "", profileUrl: "" };
}

/**
 * Search for a company on LinkedIn.
 */
export async function scrapeLinkedInCompany(
  companyName: string
): Promise<string> {
  const slug = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-");

  const urls = [
    `https://www.linkedin.com/company/${slug}`,
    `https://nz.linkedin.com/company/${slug}`,
  ];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (html && html.length > 1000) {
      const page = extractFromHtml(html, url);
      return `LinkedIn Company: ${page.title}\n${page.metaDescription}\n\n${page.bodyText.slice(0, 3000)}`;
    }
  }

  return "";
}
