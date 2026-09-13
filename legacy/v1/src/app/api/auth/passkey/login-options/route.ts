import { NextResponse } from "next/server";
import { getLoginOptions } from "@/lib/webauthn";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { options, challengeKey } = await getLoginOptions(body.email);
    return NextResponse.json({ options, challengeKey });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
