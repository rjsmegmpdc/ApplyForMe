import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildHiringManagerResearch } from "@/lib/research/hiring-manager-researcher";
import { scrapeLinkedIn, scrapeCompany } from "@/lib/research/web-scraper";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, company, jobTitle } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let searchResults = "";

  try {
    // Phase 1: Try LinkedIn for the hiring manager
    const linkedin = await scrapeLinkedIn(name, company);
    if (linkedin.text.length > 100) {
      searchResults = linkedin.text;
      if (linkedin.profileUrl) {
        searchResults += `\n\nProfile URL: ${linkedin.profileUrl}`;
      }
    }

    // Phase 2: If we have the company, check their team/leadership page
    if (company) {
      const companyData = await scrapeCompany(company);
      if (companyData.teamPage) {
        const teamText = companyData.teamPage.bodyText;
        // Check if the hiring manager is mentioned on the team page
        const nameParts = name.toLowerCase().split(/\s+/);
        if (nameParts.some((p) => teamText.toLowerCase().includes(p))) {
          searchResults += "\n\n--- COMPANY TEAM PAGE ---\n" + teamText.slice(0, 2000);
        }
      }

      // Check if they're in the discovered leaders list
      const matchedLeader = companyData.leaders.find((l) =>
        nameParts.some((p) => l.name.toLowerCase().includes(p))
      );
      if (matchedLeader) {
        searchResults += `\n\nCompany listing: ${matchedLeader.name} — ${matchedLeader.title}`;
      }
    }
  } catch {
    // Fall back to placeholder
  }

  const research = buildHiringManagerResearch(
    name,
    company || "",
    jobTitle || "",
    searchResults || undefined
  );

  return NextResponse.json(research);
}
