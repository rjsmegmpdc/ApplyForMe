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
  const { profileId, jobText, hiringManager } = body;

  if (!profileId || !jobText) {
    return NextResponse.json({ error: "profileId and jobText are required" }, { status: 400 });
  }

  const userId = (session.user as { id?: string }).id!;
  if (!canAccessProfile(role, userId, profileId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await loadProfile(profileId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const analysis = analyzeJob(jobText, profile);

  // Save to applications
  const app = await prisma.application.create({
    data: {
      userId: profileId,
      jobTitle: analysis.jobTitle,
      company: analysis.company,
      jobText,
      hiringManager: hiringManager || null,
      matchPercentage: analysis.matchPercentage,
      officeLocation: analysis.officeLocation,
      analysisJson: JSON.stringify(analysis),
    },
  });

  return NextResponse.json({ ...analysis, applicationId: app.id });
}
