import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const benefits = await prisma.priorityBenefit.findMany({
    where: { userId: id },
    orderBy: { priority: "asc" },
  });

  return NextResponse.json(benefits);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role as Role;
  const userId = (session.user as { id?: string }).id!;

  if (!canAccessProfile(role, userId, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const benefits = body.benefits as { keyword: string; priority: number }[];

  if (!Array.isArray(benefits)) {
    return NextResponse.json({ error: "benefits array required" }, { status: 400 });
  }

  // Replace all
  await prisma.priorityBenefit.deleteMany({ where: { userId: id } });
  for (const b of benefits) {
    await prisma.priorityBenefit.create({
      data: { userId: id, keyword: b.keyword, priority: b.priority },
    });
  }

  const updated = await prisma.priorityBenefit.findMany({
    where: { userId: id },
    orderBy: { priority: "asc" },
  });

  return NextResponse.json(updated);
}
