import { NextResponse } from "next/server";
import { verifyLogin } from "@/lib/webauthn";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { challengeKey, response } = body;

    if (!challengeKey || !response) {
      return NextResponse.json({ error: "challengeKey and response required" }, { status: 400 });
    }

    const result = await verifyLogin(challengeKey, response);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
