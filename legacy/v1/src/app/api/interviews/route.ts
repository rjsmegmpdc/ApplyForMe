import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { InterviewQuestion } from "@/lib/types";

// GET: fetch interview notes for an application
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("applicationId");
  if (!applicationId) return NextResponse.json({ error: "applicationId required" }, { status: 400 });

  const notes = await prisma.interviewNote.findMany({
    where: { applicationId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(notes);
}

// POST: create interview notes from questions
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { applicationId, questions } = body as {
    applicationId: string;
    questions: InterviewQuestion[];
  };

  if (!applicationId || !questions) {
    return NextResponse.json({ error: "applicationId and questions required" }, { status: 400 });
  }

  // Delete existing notes for this application
  await prisma.interviewNote.deleteMany({ where: { applicationId } });

  // Create new notes
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await prisma.interviewNote.create({
      data: {
        applicationId,
        questionKey: q.questionKey,
        question: q.question,
        answer: q.answer || null,
        sortOrder: i,
      },
    });
  }

  const notes = await prisma.interviewNote.findMany({
    where: { applicationId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(notes);
}
