import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildCompanyResearch } from "@/lib/research/company-researcher";
import { scrapeCompany, scrapeLinkedInCompany } from "@/lib/research/web-scraper";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { companyName, jobTitle } = body;

  if (!companyName) {
    return NextResponse.json({ error: "companyName is required" }, { status: 400 });
  }

  let searchResults = "";

  try {
    // Phase 1: Scrape the company's actual website
    const scraped = await scrapeCompany(companyName);

    if (scraped.allText.length > 100) {
      searchResults = scraped.allText;

      // Append discovered leaders
      if (scraped.leaders.length > 0) {
        searchResults += "\n\n--- LEADERSHIP ---\n";
        for (const leader of scraped.leaders) {
          searchResults += `${leader.name} — ${leader.title}\n`;
        }
      }
    }

    // Phase 2: Try LinkedIn company page for additional data
    const linkedInData = await scrapeLinkedInCompany(companyName);
    if (linkedInData.length > 100) {
      searchResults += "\n\n--- LINKEDIN ---\n" + linkedInData;
    }
  } catch {
    // Silently fall back to placeholder
  }

  const research = buildCompanyResearch(
    companyName,
    jobTitle || "",
    searchResults || undefined
  );

  return NextResponse.json(research);
}
