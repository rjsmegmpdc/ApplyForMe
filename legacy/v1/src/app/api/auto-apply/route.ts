import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadProfile } from "@/lib/profile-loader";
import { analyzeJob } from "@/lib/job-analyzer";
import { sendEmail } from "@/lib/email";
import { generateCV, generateCoverLetter } from "@/lib/docx-generator";
import { Packer } from "docx";
import { hasPermission, type Role } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "analysis:run")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { profileId, jobText, recruiterEmail, seekUrl } = body;

  if (!profileId || !jobText) {
    return NextResponse.json({ error: "profileId and jobText required" }, { status: 400 });
  }

  const profile = await loadProfile(profileId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // 1. Analyse
  const analysis = analyzeJob(jobText, profile);

  // 2. Save application
  const app = await prisma.application.create({
    data: {
      userId: profileId,
      jobTitle: analysis.jobTitle,
      company: analysis.company,
      jobText,
      matchPercentage: analysis.matchPercentage,
      officeLocation: analysis.officeLocation,
      analysisJson: JSON.stringify(analysis),
      status: recruiterEmail ? "applied" : "analysed",
      appliedAt: recruiterEmail ? new Date() : null,
    },
  });

  // 3. Generate documents
  const cvDoc = generateCV(analysis, profile);
  const letterDoc = generateCoverLetter(analysis, profile);
  const cvBuffer = Buffer.from(await Packer.toBuffer(cvDoc));
  const letterBuffer = Buffer.from(await Packer.toBuffer(letterDoc));

  const safeName = profile.personal.name.replace(/\s+/g, "_");

  // 4. Send email if recruiter email provided
  let emailResult = null;
  if (recruiterEmail) {
    emailResult = await sendEmail({
      to: recruiterEmail,
      subject: `Application: ${analysis.jobTitle} — ${profile.personal.name}`,
      text: `Dear Hiring Manager,\n\nPlease find attached my CV and cover letter for the ${analysis.jobTitle} position at ${analysis.company}.\n\nKind regards,\n${profile.personal.name}`,
      attachments: [
        { filename: `${safeName}_CV.docx`, content: cvBuffer, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        { filename: `${safeName}_Cover_Letter.docx`, content: letterBuffer, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ],
      applicationId: app.id,
    });
  }

  return NextResponse.json({
    applicationId: app.id,
    analysis: {
      jobTitle: analysis.jobTitle,
      company: analysis.company,
      matchPercentage: analysis.matchPercentage,
      officeLocation: analysis.officeLocation,
      strongMatches: analysis.matches.filter((m) => m.matchStrength === "strong").length,
      missingSkills: analysis.missingSkills,
    },
    emailSent: emailResult?.success || false,
    seekUrl,
  });
}
