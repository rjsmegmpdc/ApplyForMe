import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { moderateContent, suggestImprovement } from "@/lib/moderation";
import { hasPermission, type Role } from "@/lib/auth-helpers";

// PUT: update a custom question (re-moderate) or admin moderate
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role as Role;
  const isAdmin = hasPermission(role, "user:manage");

  const existing = await prisma.customQuestion.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Non-admin can only edit their own
  if (!isAdmin && existing.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // Admin moderation action
  if (isAdmin && body.moderationAction) {
    const updated = await prisma.customQuestion.update({
      where: { id },
      data: {
        status: body.moderationAction, // "approved", "rejected", "needs_review"
        moderationNote: body.moderationNote || existing.moderationNote,
      },
    });
    return NextResponse.json(updated);
  }

  // User editing their question
  if (body.question) {
    const modResult = moderateContent(body.question);
    if (!modResult.approved) {
      return NextResponse.json({
        error: "Content did not pass moderation",
        moderation: modResult,
        suggestion: modResult.suggestion || suggestImprovement(body.question),
      }, { status: 422 });
    }
  }

  if (body.desiredOutcome) {
    const modResult = moderateContent(body.desiredOutcome);
    if (!modResult.approved) {
      return NextResponse.json({
        error: "Desired outcome did not pass moderation",
        moderation: modResult,
      }, { status: 422 });
    }
  }

  const updated = await prisma.customQuestion.update({
    where: { id },
    data: {
      question: body.question?.trim() || undefined,
      desiredOutcome: body.desiredOutcome?.trim() ?? undefined,
      category: body.category || undefined,
      rating: body.rating !== undefined ? body.rating : undefined,
      favourite: body.favourite !== undefined ? body.favourite : undefined,
      excluded: body.excluded !== undefined ? body.excluded : undefined,
      includeInDeck: body.includeInDeck !== undefined ? body.includeInDeck : undefined,
      status: body.question ? "needs_review" : undefined, // Re-review on text change
    },
  });

  return NextResponse.json(updated);
}

// DELETE
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role as Role;

  const existing = await prisma.customQuestion.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!hasPermission(role, "user:manage") && existing.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.customQuestion.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
