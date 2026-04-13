import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const updated = await prisma.recruiterContact.update({
    where: { id },
    data: {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      company: body.company || null,
      agency: body.agency || null,
      linkedinUrl: body.linkedinUrl || null,
      notes: body.notes || null,
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
      lastContacted: body.lastContacted ? new Date(body.lastContacted) : undefined,
      status: body.status || undefined,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.recruiterContact.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
