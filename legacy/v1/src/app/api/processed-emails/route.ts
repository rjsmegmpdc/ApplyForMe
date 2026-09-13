import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET: check if a Gmail message has been processed
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const gmailMsgId = searchParams.get("gmailMsgId");

  if (gmailMsgId) {
    const record = await prisma.processedEmail.findUnique({ where: { gmailMsgId } });
    if (record) return NextResponse.json(record);
    return NextResponse.json({ exists: false }, { status: 404 });
  }

  // List recent processed emails
  const records = await prisma.processedEmail.findMany({
    orderBy: { processedAt: "desc" },
    take: 50,
  });
  return NextResponse.json(records);
}

// POST: record a processed email
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { gmailMsgId, threadId, source, jobTitle, company, action, matchPct, applicationId } = body;

  if (!gmailMsgId) {
    return NextResponse.json({ error: "gmailMsgId required" }, { status: 400 });
  }

  // Upsert — if already exists, update the action
  const record = await prisma.processedEmail.upsert({
    where: { gmailMsgId },
    update: { action, matchPct, applicationId },
    create: {
      gmailMsgId,
      threadId: threadId || null,
      source: source || "seek",
      jobTitle: jobTitle || null,
      company: company || null,
      action: action || "analysed",
      matchPct: matchPct || null,
      applicationId: applicationId || null,
    },
  });

  return NextResponse.json(record);
}
