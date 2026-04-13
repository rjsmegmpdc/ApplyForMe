import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadProfile } from "@/lib/profile-loader";
import { hasPermission, canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role as Role;
  const userId = (session.user as { id?: string }).id!;

  if (!canAccessProfile(role, userId, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await loadProfile(id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(profile);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role as Role;
  const userId = (session.user as { id?: string }).id!;

  if (!hasPermission(role, "profile:edit_own")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canAccessProfile(role, userId, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // Update user fields
  await prisma.user.update({
    where: { id },
    data: {
      name: body.personal?.name,
      email: body.personal?.email || undefined,
      phone: body.personal?.phone,
      address: body.personal?.address,
      linkedin: body.personal?.linkedin,
      nationality: body.personal?.nationality,
      yearsExperience: body.personal?.years_experience,
      executiveSummary: body.executive_summary,
    },
  });

  // Replace competencies
  if (body.core_competencies) {
    await prisma.coreCompetency.deleteMany({ where: { userId: id } });
    for (let i = 0; i < body.core_competencies.length; i++) {
      await prisma.coreCompetency.create({
        data: { userId: id, competency: body.core_competencies[i], sortOrder: i },
      });
    }
  }

  // Replace career entries
  if (body.career_history) {
    await prisma.careerHighlight.deleteMany({
      where: { careerEntry: { userId: id } },
    });
    await prisma.careerKeyword.deleteMany({
      where: { careerEntry: { userId: id } },
    });
    await prisma.careerEntry.deleteMany({ where: { userId: id } });

    for (let i = 0; i < body.career_history.length; i++) {
      const role = body.career_history[i];
      const entry = await prisma.careerEntry.create({
        data: {
          userId: id,
          title: role.title,
          company: role.company,
          location: role.location || "",
          startDate: role.start_date || "",
          endDate: role.end_date || "",
          sortOrder: i,
        },
      });
      for (let j = 0; j < (role.highlights || []).length; j++) {
        await prisma.careerHighlight.create({
          data: { careerEntryId: entry.id, highlight: role.highlights[j], sortOrder: j },
        });
      }
      for (const kw of role.keywords || []) {
        await prisma.careerKeyword.create({
          data: { careerEntryId: entry.id, keyword: kw },
        });
      }
    }
  }

  // Replace certifications
  if (body.certifications_and_training) {
    await prisma.certification.deleteMany({ where: { userId: id } });
    for (let i = 0; i < body.certifications_and_training.length; i++) {
      const cert = body.certifications_and_training[i];
      await prisma.certification.create({
        data: { userId: id, name: cert.name, year: cert.year, sortOrder: i },
      });
    }
  }

  const updated = await loadProfile(id);
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role as Role;

  if (!hasPermission(role, "profile:delete")) {
    return NextResponse.json({ error: "Only admins can delete profiles" }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
