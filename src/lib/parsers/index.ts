import type { UserProfile } from "../types";
import { extractProfileFromText } from "./profile-extractor";

export async function parseFile(
  buffer: Buffer,
  filename: string
): Promise<Partial<UserProfile>> {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "json":
      return parseJson(buffer);
    case "docx":
      return parseDocx(buffer);
    case "xlsx":
    case "xls":
      return parseXlsx(buffer);
    case "md":
    case "txt":
      return parseText(buffer);
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

async function parseJson(buffer: Buffer): Promise<Partial<UserProfile>> {
  const text = buffer.toString("utf-8");
  const data = JSON.parse(text);

  // If it matches master-profile.json format, use it directly
  if (data.personal && data.career_history) {
    return {
      personal: {
        name: data.personal.name || "",
        email: data.personal.email_personal || data.personal.email || "",
        phone: data.personal.phone || "",
        address: data.personal.address || "",
        linkedin: data.personal.linkedin || "",
        nationality: data.personal.nationality || "",
        years_experience: data.personal.years_experience || 0,
      },
      executive_summary: data.executive_summary || "",
      core_competencies: data.core_competencies || [],
      career_history: data.career_history || [],
      certifications_and_training: data.certifications_and_training || [],
    };
  }

  // Otherwise try to extract from flat JSON
  return extractProfileFromText(JSON.stringify(data, null, 2));
}

async function parseDocx(buffer: Buffer): Promise<Partial<UserProfile>> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return extractProfileFromText(result.value);
}

async function parseXlsx(buffer: Buffer): Promise<Partial<UserProfile>> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in spreadsheet");

  const sheet = workbook.Sheets[sheetName];
  const text = XLSX.utils.sheet_to_txt(sheet);
  return extractProfileFromText(text);
}

async function parseText(buffer: Buffer): Promise<Partial<UserProfile>> {
  const text = buffer.toString("utf-8");
  return extractProfileFromText(text);
}
