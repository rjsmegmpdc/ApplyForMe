import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadProfile } from "@/lib/profile-loader";
import { generateFlashcards } from "@/lib/anki/flashcard-generator";
import { exportToCSV } from "@/lib/anki/csv-exporter";
import { exportToAPKG } from "@/lib/anki/apkg-exporter";
import { hasPermission, type Role } from "@/lib/auth-helpers";
import type { AnalysisResult } from "@/lib/job-analyzer";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "document:download")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { applicationId, format } = body;

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId required" }, { status: 400 });
  }

  // Load the application
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || !app.analysisJson) {
    return NextResponse.json({ error: "Application not found or has no analysis" }, { status: 404 });
  }

  const analysis: AnalysisResult = JSON.parse(app.analysisJson);

  // Load profile
  const profile = await loadProfile(app.userId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Get user's preferred format
  const user = await prisma.user.findUnique({ where: { id: app.userId }, select: { ankiExportFormat: true } });
  const exportFormat = format || user?.ankiExportFormat || "both";

  // Parse company research if available
  let companyResearch = undefined;
  if (app.briefingJson) {
    try { companyResearch = JSON.parse(app.briefingJson); } catch {}
  }

  // Generate flashcards
  const cards = generateFlashcards(analysis, profile, companyResearch);
  const deckName = `${analysis.jobTitle} - ${analysis.company}`;

  const result: { cardCount: number; csv?: string; apkg?: string } = {
    cardCount: cards.length,
  };

  // Export in requested format(s)
  if (exportFormat === "csv" || exportFormat === "both") {
    const csvBuffer = exportToCSV(cards);
    result.csv = csvBuffer.toString("base64");
  }

  if (exportFormat === "apkg" || exportFormat === "both") {
    try {
      const apkgBuffer = await exportToAPKG(cards, deckName);
      result.apkg = apkgBuffer.toString("base64");
    } catch (e) {
      console.error("APKG generation failed:", e);
      // Fall back to CSV only
      if (!result.csv) {
        const csvBuffer = exportToCSV(cards);
        result.csv = csvBuffer.toString("base64");
      }
    }
  }

  return NextResponse.json(result);
}
