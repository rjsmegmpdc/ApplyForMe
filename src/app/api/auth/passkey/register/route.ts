import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyRegistration } from "@/lib/webauthn";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "No user ID" }, { status: 400 });

  try {
    const body = await request.json();
    const result = await verifyRegistration(userId, body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
