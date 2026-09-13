import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRegistrationOptions } from "@/lib/webauthn";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "No user ID" }, { status: 400 });

  try {
    const options = await getRegistrationOptions(userId);
    return NextResponse.json(options);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
