import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { hasPermission, type Role } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "document:download")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { to, subject, message, applicationId, attachments } = body;

  if (!to || !subject) {
    return NextResponse.json({ error: "to and subject are required" }, { status: 400 });
  }

  // Convert base64 attachments back to buffers
  const parsedAttachments = (attachments || []).map((a: { filename: string; base64: string; contentType: string }) => ({
    filename: a.filename,
    content: Buffer.from(a.base64, "base64"),
    contentType: a.contentType,
  }));

  const result = await sendEmail({
    to,
    subject,
    text: message || "",
    html: message ? `<p>${message.replace(/\n/g, "<br>")}</p>` : undefined,
    attachments: parsedAttachments,
    applicationId,
  });

  // Update application status if sent successfully
  if (result.success && applicationId) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "applied", appliedAt: new Date() },
    }).catch(() => {});
  }

  return NextResponse.json(result);
}
