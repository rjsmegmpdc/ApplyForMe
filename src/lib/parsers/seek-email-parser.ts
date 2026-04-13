/**
 * Extracts structured job data from Seek.co.nz alert emails.
 * Handles both HTML and plain text email content.
 */

export interface SeekJobListing {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  seekUrl: string;
}

export function parseSeekEmail(emailBody: string): SeekJobListing[] {
  const jobs: SeekJobListing[] = [];

  // Strip HTML tags but preserve structure
  const text = emailBody
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract Seek URLs
  const seekUrls = emailBody.match(/https?:\/\/(?:www\.)?seek\.co\.nz\/job\/\d+/gi) || [];

  // Try to find job blocks — Seek emails typically list multiple jobs
  // Pattern: Job title followed by company, location, then description snippet
  const jobBlockPattern = /([A-Z][^\n]{10,80})\n\s*(?:at\s+)?([A-Z][^\n]{3,60})\n\s*([A-Za-z\s,]+(?:Auckland|Wellington|Christchurch|Hamilton|Remote|New Zealand)[^\n]*)/gi;

  let match;
  let urlIndex = 0;

  while ((match = jobBlockPattern.exec(text)) !== null) {
    const title = match[1].trim();
    const company = match[2].trim();
    const location = match[3].trim();

    // Skip if this looks like Seek boilerplate
    if (title.toLowerCase().includes("unsubscribe") || title.toLowerCase().includes("privacy")) continue;
    if (title.length < 5 || company.length < 2) continue;

    jobs.push({
      title,
      company,
      location,
      salary: extractSalary(text, title),
      description: extractDescription(text, title),
      seekUrl: seekUrls[urlIndex] || "",
    });
    urlIndex++;
  }

  // Fallback: if no structured blocks found, try simpler extraction
  if (jobs.length === 0 && text.length > 100) {
    // Single job email or unstructured format
    const titleMatch = text.match(/(?:new job|job alert|matching job)[:\s]+([^\n.]{10,80})/i);
    const companyMatch = text.match(/(?:at|company|employer)[:\s]+([^\n.]{3,60})/i);
    const locationMatch = text.match(/(Auckland|Wellington|Christchurch|Hamilton|Tauranga|Dunedin|Remote|New Zealand)[^\n]*/i);

    if (titleMatch || seekUrls.length > 0) {
      jobs.push({
        title: titleMatch?.[1]?.trim() || "Job from Seek",
        company: companyMatch?.[1]?.trim() || "",
        location: locationMatch?.[0]?.trim() || "",
        salary: extractSalary(text, ""),
        description: cleanDescription(text),
        seekUrl: seekUrls[0] || "",
      });
    }
  }

  return jobs;
}

function extractSalary(text: string, nearTitle: string): string {
  // Look for salary patterns near the job title
  const salaryPatterns = [
    /\$[\d,]+\s*[-–]\s*\$[\d,]+/,
    /\$[\d,]+\s*(?:pa|per\s*annum|k|K)/,
    /[\d,]+\s*[-–]\s*[\d,]+\s*(?:pa|per\s*annum|NZD|AUD)/,
  ];

  for (const pattern of salaryPatterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }

  return "";
}

function extractDescription(text: string, title: string): string {
  // Find the section after the title and extract ~500 chars of description
  const titleIndex = text.indexOf(title);
  if (titleIndex === -1) return cleanDescription(text);

  const afterTitle = text.slice(titleIndex + title.length, titleIndex + title.length + 1000);
  return cleanDescription(afterTitle);
}

function cleanDescription(text: string): string {
  // Remove Seek boilerplate
  const boilerplate = [
    /unsubscribe[^\n]*/gi,
    /manage\s+your\s+alerts?[^\n]*/gi,
    /privacy\s+policy[^\n]*/gi,
    /terms\s+(?:of\s+use|and\s+conditions)[^\n]*/gi,
    /\u00a9\s*\d{4}\s*seek/gi,
    /seek\.co\.nz/gi,
    /view\s+(?:this\s+)?job[^\n]*/gi,
    /apply\s+now[^\n]*/gi,
  ];

  let cleaned = text;
  for (const pattern of boilerplate) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

/**
 * Extracts full job description by following a Seek URL.
 * Returns the job page text for analysis.
 */
export async function fetchSeekJobPage(seekUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(seekUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return "";

    const html = await res.text();
    // Extract job description from Seek's page structure
    const descMatch = html.match(/<div[^>]*data-automation="jobAdDetails"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      return descMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Fallback: strip all HTML
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  } catch {
    return "";
  }
}
