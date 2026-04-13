import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role as Role;
  const userId = (session.user as { id?: string }).id!;

  const app = await prisma.application.findUnique({
    where: { id },
    include: { interviewNotes: { orderBy: { sortOrder: "asc" } } },
  });

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessProfile(role, userId, app.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(app);
}
