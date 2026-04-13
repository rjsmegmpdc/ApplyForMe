import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, type Role } from "@/lib/auth-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role as Role;
  const isAdmin = hasPermission(role, "profile:read_all");

  const where = isAdmin ? {} : { userId };

  // Total applications
  const totalApplications = await prisma.application.count({ where });
  const appliedCount = await prisma.application.count({ where: { ...where, status: "applied" } });
  const analysedCount = await prisma.application.count({ where: { ...where, status: "analysed" } });

  // Average match percentage
  const apps = await prisma.application.findMany({
    where,
    select: { matchPercentage: true, createdAt: true, status: true, company: true, jobTitle: true },
    orderBy: { createdAt: "desc" },
  });

  const matchPercentages = apps.map((a) => a.matchPercentage || 0).filter((m) => m > 0);
  const avgMatch = matchPercentages.length > 0
    ? Math.round(matchPercentages.reduce((s, m) => s + m, 0) / matchPercentages.length)
    : 0;
  const highMatchCount = matchPercentages.filter((m) => m >= 80).length;

  // Applications by week (last 8 weeks)
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const recentApps = apps.filter((a) => a.createdAt >= eightWeeksAgo);

  const weeklyData: { week: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekLabel = weekStart.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
    const count = recentApps.filter((a) => a.createdAt >= weekStart && a.createdAt < weekEnd).length;
    weeklyData.push({ week: weekLabel, count });
  }

  // Top companies applied to
  const companyCounts: Record<string, number> = {};
  for (const app of apps) {
    if (app.company) {
      companyCounts[app.company] = (companyCounts[app.company] || 0) + 1;
    }
  }
  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Match score distribution
  const distribution = {
    high: matchPercentages.filter((m) => m >= 80).length,
    medium: matchPercentages.filter((m) => m >= 60 && m < 80).length,
    low: matchPercentages.filter((m) => m < 60).length,
  };

  // Profile count
  const profileCount = await prisma.user.count();
  const recruiterCount = await prisma.recruiterContact.count({ where: isAdmin ? {} : { userId } });

  return NextResponse.json({
    totalApplications,
    appliedCount,
    analysedCount,
    avgMatch,
    highMatchCount,
    weeklyData,
    topCompanies,
    distribution,
    profileCount,
    recruiterCount,
  });
}
