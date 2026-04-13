import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  const userId = (session.user as { id?: string }).id!;
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("userId");

  if (profileId && !canAccessProfile(role, userId, profileId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where = profileId
    ? { userId: profileId }
    : hasPermission(role, "application:read_all")
    ? {}
    : { userId };

  const apps = await prisma.application.findMany({
    where,
    select: {
      id: true,
      jobTitle: true,
      company: true,
      matchPercentage: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(apps);
}
