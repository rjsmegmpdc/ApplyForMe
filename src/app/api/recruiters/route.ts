import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, canAccessProfile, type Role } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role as Role;

  const where = hasPermission(role, "profile:read_all") ? {} : { userId };

  const contacts = await prisma.recruiterContact.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(contacts);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const body = await request.json();

  const contact = await prisma.recruiterContact.create({
    data: {
      userId,
      name: body.name || "",
      email: body.email || null,
      phone: body.phone || null,
      company: body.company || null,
      agency: body.agency || null,
      linkedinUrl: body.linkedinUrl || null,
      notes: body.notes || null,
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
    },
  });

  return NextResponse.json(contact);
}
