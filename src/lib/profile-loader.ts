import { prisma } from "./db";
import type { UserProfile } from "./types";

export async function loadProfile(userId: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      competencies: { orderBy: { sortOrder: "asc" } },
      careerEntries: {
        orderBy: { sortOrder: "asc" },
        include: {
          highlights: { orderBy: { sortOrder: "asc" } },
          keywords: true,
        },
      },
      certifications: { orderBy: { sortOrder: "asc" } },
      priorityBenefits: { orderBy: { priority: "asc" } },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    personal: {
      name: user.name,
      email: user.email || "",
      phone: user.phone || "",
      address: user.address || "",
      linkedin: user.linkedin || "",
      nationality: user.nationality || "",
      years_experience: user.yearsExperience || 0,
    },
    executive_summary: user.executiveSummary || "",
    core_competencies: user.competencies.map((c) => c.competency),
    career_history: user.careerEntries.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location || "",
      start_date: e.startDate || "",
      end_date: e.endDate || "",
      highlights: e.highlights.map((h) => h.highlight),
      keywords: e.keywords.map((k) => k.keyword),
    })),
    certifications_and_training: user.certifications.map((c) => ({
      name: c.name,
      year: c.year || 0,
    })),
    priority_benefits: user.priorityBenefits.map((b) => ({
      keyword: b.keyword,
      priority: b.priority,
    })),
  };
}

export async function listProfiles(): Promise<
  { id: string; name: string; email: string | null; updatedAt: Date; applicationCount: number }[]
> {
  const users = await prisma.user.findMany({
    include: { _count: { select: { applications: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    updatedAt: u.updatedAt,
    applicationCount: u._count.applications,
  }));
}
