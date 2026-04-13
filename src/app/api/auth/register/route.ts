import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPin, isValidPin } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, pin } = body;

    if (!name || !email || !pin) {
      return NextResponse.json({ error: "Name, email, and PIN are required" }, { status: 400 });
    }

    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
    }

    // Check if this exact email+name combo already exists (allow same email for different profiles)
    const existing = await prisma.user.findFirst({ where: { email, pin: { not: null } } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists. Use a Gmail alias (e.g. you+profile2@gmail.com) for additional profiles." }, { status: 409 });
    }

    // Check max 10 users
    const count = await prisma.user.count();
    if (count >= 10) {
      return NextResponse.json({ error: "Maximum 10 users reached" }, { status: 403 });
    }

    const hashedPin = await hashPin(pin);

    // First user becomes ADMIN
    const role = count === 0 ? "ADMIN" : "USER";

    const user = await prisma.user.create({
      data: {
        name,
        email,
        pin: hashedPin,
        role,
        emailVerified: new Date(), // Auto-verify in local dev
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
