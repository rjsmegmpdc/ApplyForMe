import type { UserProfile, CareerRole, CertificationEntry } from "../types";

export function extractProfileFromText(text: string): Partial<UserProfile> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract contact info
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = text.match(/(?:\+64|0)\s*\d[\d\s-]{7,12}/);
  const addressLines = lines.filter((l) =>
    /(?:street|road|drive|terrace|avenue|auckland|wellington|christchurch|nz|new zealand)/i.test(l)
  );

  // Find name (usually first non-empty line that's not a heading)
  let name = "";
  for (const line of lines.slice(0, 5)) {
    if (line.length > 2 && line.length < 60 && !/^(cv|resume|curriculum|profile)/i.test(line)) {
      name = line.replace(/[*#_]/g, "").trim();
      break;
    }
  }

  // Detect sections
  const sectionPattern = /^(?:#{1,3}\s*)?(?:\*{1,2})?(career|experience|work\s*history|employment|professional|certifications?|education|training|skills|competencies|summary|profile|qualifications)/i;

  const sections: Record<string, string[]> = {};
  let currentSection = "preamble";

  for (const line of lines) {
    const match = line.match(sectionPattern);
    if (match) {
      currentSection = match[1].toLowerCase();
      sections[currentSection] = [];
    } else {
      if (!sections[currentSection]) sections[currentSection] = [];
      sections[currentSection].push(line);
    }
  }

  // Extract career history
  const careerLines = [
    ...(sections["career"] || []),
    ...(sections["experience"] || []),
    ...(sections["work history"] || []),
    ...(sections["employment"] || []),
    ...(sections["professional"] || []),
  ];

  const career_history = extractCareerEntries(careerLines);

  // Extract certifications
  const certLines = [
    ...(sections["certifications"] || []),
    ...(sections["certification"] || []),
    ...(sections["education"] || []),
    ...(sections["training"] || []),
    ...(sections["qualifications"] || []),
  ];
  const certifications = extractCertifications(certLines);

  // Extract competencies
  const skillLines = [
    ...(sections["skills"] || []),
    ...(sections["competencies"] || []),
  ];
  const competencies = extractBulletItems(skillLines);

  // Extract summary
  const summaryLines = [
    ...(sections["summary"] || []),
    ...(sections["profile"] || []),
    ...(sections["preamble"] || []).slice(0, 5),
  ];
  const summary = summaryLines.filter((l) => l.length > 30).join(" ").slice(0, 500);

  return {
    personal: {
      name: name || "Unknown",
      email: emailMatch?.[0] || "",
      phone: phoneMatch?.[0]?.trim() || "",
      address: addressLines[0] || "",
      linkedin: "",
      nationality: "",
      years_experience: 0,
    },
    executive_summary: summary,
    core_competencies: competencies.length > 0 ? competencies : [],
    career_history: career_history.length > 0 ? career_history : [],
    certifications_and_training: certifications,
  };
}

function extractCareerEntries(lines: string[]): CareerRole[] {
  const entries: CareerRole[] = [];
  let current: Partial<CareerRole> | null = null;

  const datePattern = /(\d{4})\s*[-–]\s*(present|\d{4})/i;
  const bulletPattern = /^[-*•]\s*/;

  for (const line of lines) {
    const dateMatch = line.match(datePattern);

    if (dateMatch && !bulletPattern.test(line)) {
      // New career entry
      if (current?.title) {
        entries.push({
          title: current.title || "",
          company: current.company || "",
          location: current.location || "",
          start_date: current.start_date || "",
          end_date: current.end_date || "",
          highlights: current.highlights || [],
          keywords: [],
        });
      }

      const titleCompany = line.replace(datePattern, "").replace(/[|,–-]+$/, "").trim();
      const parts = titleCompany.split(/\s*[|@–]\s*/);

      current = {
        title: parts[0]?.trim() || line,
        company: parts[1]?.trim() || "",
        location: parts[2]?.trim() || "",
        start_date: dateMatch[1],
        end_date: dateMatch[2],
        highlights: [],
        keywords: [],
      };
    } else if (current && bulletPattern.test(line)) {
      current.highlights = current.highlights || [];
      current.highlights.push(line.replace(bulletPattern, "").trim());
    }
  }

  // Push last entry
  if (current?.title) {
    entries.push({
      title: current.title || "",
      company: current.company || "",
      location: current.location || "",
      start_date: current.start_date || "",
      end_date: current.end_date || "",
      highlights: current.highlights || [],
      keywords: [],
    });
  }

  return entries;
}

function extractCertifications(lines: string[]): CertificationEntry[] {
  const certs: CertificationEntry[] = [];
  const yearPattern = /(\d{4})/;

  for (const line of lines) {
    const clean = line.replace(/^[-*•]\s*/, "").trim();
    if (clean.length < 3) continue;

    const yearMatch = clean.match(yearPattern);
    certs.push({
      name: clean.replace(/\s*[-–]\s*(completed|earned|awarded)?\s*\d{4}\.?$/i, "").trim(),
      year: yearMatch ? parseInt(yearMatch[1]) : 0,
    });
  }

  return certs;
}

function extractBulletItems(lines: string[]): string[] {
  return lines
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 2 && l.length < 200);
}
