import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { moderateContent, suggestImprovement } from "@/lib/moderation";
import { hasPermission, type Role } from "@/lib/auth-helpers";

// GET: fetch custom questions for the current user (or all for admin)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role as Role;

  const where = hasPermission(role, "profile:read_all") ? {} : { userId };

  const questions = await prisma.customQuestion.findMany({
    where,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(questions);
}

// POST: create a new custom question (with moderation)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const body = await request.json();
  const { question, desiredOutcome, category, basedOnKey } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "Question text is required" }, { status: 400 });
  }

  // Run moderation
  const modResult = moderateContent(question);
  const outcomeModResult = desiredOutcome ? moderateContent(desiredOutcome) : null;

  // Check if blocked
  if (!modResult.approved) {
    return NextResponse.json({
      error: "Content did not pass moderation",
      moderation: modResult,
      suggestion: modResult.suggestion || suggestImprovement(question),
    }, { status: 422 });
  }

  if (outcomeModResult && !outcomeModResult.approved) {
    return NextResponse.json({
      error: "Desired outcome did not pass moderation",
      moderation: outcomeModResult,
      suggestion: outcomeModResult.suggestion,
    }, { status: 422 });
  }

  // Determine status based on warnings
  const hasWarnings = modResult.issues.length > 0 || (outcomeModResult?.issues.length || 0) > 0;
  const status = hasWarnings ? "needs_review" : "approved";
  const moderationNote = hasWarnings
    ? modResult.issues.map((i) => i.detail).join("; ") + (outcomeModResult ? "; " + outcomeModResult.issues.map((i) => i.detail).join("; ") : "")
    : null;

  const created = await prisma.customQuestion.create({
    data: {
      userId,
      question: question.trim(),
      desiredOutcome: desiredOutcome?.trim() || null,
      category: category || "custom",
      basedOnKey: basedOnKey || null,
      status,
      moderationNote,
    },
  });

  return NextResponse.json({
    ...created,
    moderation: modResult,
    outcomeModeration: outcomeModResult,
  });
}
