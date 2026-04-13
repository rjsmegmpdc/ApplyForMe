import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  const userId = (session.user as { id?: string }).id!;

  let users;
  if (hasPermission(role, "profile:read_all")) {
    users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, updatedAt: true, _count: { select: { applications: true } } },
      orderBy: { name: "asc" },
    });
  } else {
    users = await prisma.user.findMany({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, updatedAt: true, _count: { select: { applications: true } } },
    });
  }

  return NextResponse.json(users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    updatedAt: u.updatedAt,
    applicationCount: u._count.applications,
  })));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "profile:edit_any") && !hasPermission(role, "profile:edit_own")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const count = await prisma.user.count();
  if (count >= 10) {
    return NextResponse.json({ error: "Maximum 10 profiles reached" }, { status: 403 });
  }

  const body = await request.json();
  const user = await prisma.user.create({
    data: {
      name: body.name || "New Profile",
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      nationality: body.nationality || null,
      yearsExperience: body.yearsExperience || null,
      executiveSummary: body.executiveSummary || null,
      role: "USER",
    },
  });

  return NextResponse.json({ id: user.id, name: user.name });
}
