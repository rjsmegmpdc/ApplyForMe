import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, type Role } from "@/lib/auth-helpers";

// DELETE: wipe all data — profiles, applications, interview notes, everything
export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "user:manage")) {
    return NextResponse.json({ error: "Only admins can reset all data" }, { status: 403 });
  }

  // Delete in order to respect foreign keys
  await prisma.interviewNote.deleteMany();
  await prisma.application.deleteMany();
  await prisma.careerHighlight.deleteMany();
  await prisma.careerKeyword.deleteMany();
  await prisma.careerEntry.deleteMany();
  await prisma.coreCompetency.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.priorityBenefit.deleteMany();
  await prisma.authenticator.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  return NextResponse.json({ deleted: true, message: "All data has been permanently deleted." });
}
