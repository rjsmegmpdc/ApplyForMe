import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET: fetch all question preferences for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const prefs = await prisma.questionPreference.findMany({
    where: { userId },
  });

  // Return as a map: questionKey → preference
  const map: Record<string, { rating: number; favourite: boolean; excluded: boolean; notes: string | null }> = {};
  for (const p of prefs) {
    map[p.questionKey] = {
      rating: p.rating,
      favourite: p.favourite,
      excluded: p.excluded,
      notes: p.notes,
    };
  }

  return NextResponse.json(map);
}

// POST: upsert a single question preference
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const body = await request.json();
  const { questionKey, rating, favourite, excluded, notes } = body;

  if (!questionKey) {
    return NextResponse.json({ error: "questionKey required" }, { status: 400 });
  }

  const pref = await prisma.questionPreference.upsert({
    where: { userId_questionKey: { userId, questionKey } },
    update: {
      rating: rating !== undefined ? rating : undefined,
      favourite: favourite !== undefined ? favourite : undefined,
      excluded: excluded !== undefined ? excluded : undefined,
      notes: notes !== undefined ? notes : undefined,
    },
    create: {
      userId,
      questionKey,
      rating: rating || 0,
      favourite: favourite || false,
      excluded: excluded || false,
      notes: notes || null,
    },
  });

  return NextResponse.json(pref);
}
