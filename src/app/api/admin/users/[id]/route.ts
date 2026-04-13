import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, type Role } from "@/lib/auth-helpers";

// PUT: update user role
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "user:manage")) {
    return NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const newRole = body.role;

  if (!["ADMIN", "USER", "VIEWER"].includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent removing the last admin
  if (newRole !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    const currentUser = await prisma.user.findUnique({ where: { id } });
    if (currentUser?.role === "ADMIN" && adminCount <= 1) {
      return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: newRole },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json(updated);
}
