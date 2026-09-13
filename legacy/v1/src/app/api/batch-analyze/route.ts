import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadProfile } from "@/lib/profile-loader";
import { analyzeJob } from "@/lib/job-analyzer";
import { hasPermission, canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "analysis:run")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { profileId, jobs } = body as { profileId: string; jobs: { text: string; label?: string }[] };

  if (!profileId || !jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return NextResponse.json({ error: "profileId and jobs array required" }, { status: 400 });
  }

  if (jobs.length > 20) {
    return NextResponse.json({ error: "Maximum 20 jobs per batch" }, { status: 400 });
  }

  const userId = (session.user as { id?: string }).id!;
  if (!canAccessProfile(role, userId, profileId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await loadProfile(profileId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const results = [];

  for (const job of jobs) {
    if (!job.text?.trim()) continue;
    const analysis = analyzeJob(job.text, profile);

    // Save to DB
    const app = await prisma.application.create({
      data: {
        userId: profileId,
        jobTitle: analysis.jobTitle,
        company: analysis.company,
        jobText: job.text,
        matchPercentage: analysis.matchPercentage,
        officeLocation: analysis.officeLocation,
        analysisJson: JSON.stringify(analysis),
        status: "analysed",
      },
    });

    results.push({
      applicationId: app.id,
      label: job.label || `${analysis.jobTitle} @ ${analysis.company}`,
      jobTitle: analysis.jobTitle,
      company: analysis.company,
      matchPercentage: analysis.matchPercentage,
      officeLocation: analysis.officeLocation,
      strongMatches: analysis.matches.filter((m) => m.matchStrength === "strong").length,
      totalRequirements: analysis.matches.length,
      missingSkills: analysis.missingSkills,
      benefitMatches: analysis.benefitMatches.filter((b) => b.found).length,
      totalBenefits: analysis.benefitMatches.length,
    });
  }

  // Sort by match percentage descending
  results.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));

  return NextResponse.json({ count: results.length, results });
}
