import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPin, isValidPin } from "@/lib/auth-helpers";
import crypto from "crypto";

// POST: request recovery (send token) or reset PIN (with token)
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.token && body.newPin) {
      // Phase 2: Reset PIN with recovery token
      if (!isValidPin(body.newPin)) {
        return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
      }

      const record = await prisma.verificationToken.findUnique({
        where: { token: body.token },
      });

      if (!record || record.expires < new Date()) {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
      }

      const user = await prisma.user.findUnique({
        where: { email: record.identifier },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const hashedPin = await hashPin(body.newPin);
      await prisma.user.update({
        where: { id: user.id },
        data: { pin: hashedPin, failedPinAttempts: 0, lockedUntil: null },
      });

      // Delete used token
      await prisma.verificationToken.delete({
        where: { identifier_token: { identifier: record.identifier, token: body.token } },
      });

      return NextResponse.json({ message: "PIN reset successfully" });
    }

    // Phase 1: Request recovery
    const { email } = body;
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({ where: { email, pin: { not: null } } });
    if (!user) {
      // Don't reveal if user exists
      return NextResponse.json({ message: "If the email exists, a recovery link has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.verificationToken.create({
      data: { identifier: email, token, expires },
    });

    // In local dev, log the token. In production, send email.
    console.log(`\n🔑 Recovery token for ${email}: ${token}`);
    console.log(`   Reset URL: ${process.env.NEXTAUTH_URL}/login?recover=${token}\n`);

    return NextResponse.json({ message: "If the email exists, a recovery link has been sent." });
  } catch (error) {
    console.error("Recovery error:", error);
    return NextResponse.json({ error: "Recovery failed" }, { status: 500 });
  }
}
