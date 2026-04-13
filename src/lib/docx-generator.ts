import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TabStopPosition,
  TabStopType,
  SectionType,
  convertInchesToTwip,
} from "docx";
import type { AnalysisResult } from "./job-analyzer";
import type { UserProfile, CompanyResearch, SalaryResearch, HiringManagerResearch } from "./types";

const COLORS = {
  primary: "1B365D",
  secondary: "2E5090",
  accent: "4A90D9",
  text: "333333",
  muted: "666666",
  light: "AAAAAA",
};

function divider(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.accent },
    },
    spacing: { before: 80, after: 120 },
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22,
        color: COLORS.primary,
        font: "Calibri",
      }),
    ],
    spacing: { before: 200, after: 60 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.accent },
    },
  });
}

function bulletPoint(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, size: 20, color: COLORS.text, font: "Calibri" }),
    ],
    bullet: { level: 0 },
    spacing: { before: 20, after: 20 },
  });
}

function textParagraph(text: string, spacing?: { before?: number; after?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, size: 21, color: COLORS.text, font: "Calibri" }),
    ],
    spacing: { before: spacing?.before ?? 40, after: spacing?.after ?? 120 },
  });
}

export function generateCV(analysis: AnalysisResult, profile: UserProfile): Document {
  const sections: Paragraph[] = [];

  // Header - Name
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: profile.personal.name,
          bold: true,
          size: 36,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
    })
  );

  // Contact info
  const contactParts = [
    profile.personal.address,
    profile.personal.phone,
    profile.personal.email,
  ].filter(Boolean);
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: contactParts.join("  |  "),
          size: 18,
          color: COLORS.muted,
          font: "Calibri",
        }),
      ],
      spacing: { after: 120 },
    })
  );

  // Tailored Summary
  sections.push(sectionHeading("Professional Summary"));
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: analysis.tailoredSummary,
          size: 20,
          color: COLORS.text,
          font: "Calibri",
          italics: false,
        }),
      ],
      spacing: { before: 40, after: 120 },
    })
  );

  // Core Competencies (filtered to job relevance)
  sections.push(sectionHeading("Core Competencies"));
  const jobKeywords = analysis.requirements.flatMap((r) => r.keywords);
  const relevantCompetencies = profile.core_competencies.filter((c) =>
    jobKeywords.some((k) => c.toLowerCase().includes(k))
  );
  const displayCompetencies =
    relevantCompetencies.length >= 4
      ? relevantCompetencies.slice(0, 10)
      : profile.core_competencies.slice(0, 10);

  // Two columns of competencies
  for (let i = 0; i < displayCompetencies.length; i += 2) {
    const left = displayCompetencies[i] || "";
    const right = displayCompetencies[i + 1] || "";
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `  \u2022  ${left}`, size: 19, color: COLORS.text, font: "Calibri" }),
          new TextRun({ text: right ? `\t\u2022  ${right}` : "", size: 19, color: COLORS.text, font: "Calibri" }),
        ],
        tabStops: [{ type: TabStopType.LEFT, position: TabStopPosition.MAX / 2 }],
        spacing: { before: 20, after: 20 },
      })
    );
  }

  // Career History
  sections.push(sectionHeading("Career History"));

  for (const role of analysis.tailoredHighlights) {
    const [titleCompany, dates] = role.role.split("(");
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: titleCompany?.trim() || role.role,
            bold: true,
            size: 21,
            color: COLORS.secondary,
            font: "Calibri",
          }),
          new TextRun({
            text: dates ? `  (${dates}` : "",
            size: 19,
            color: COLORS.muted,
            font: "Calibri",
          }),
        ],
        spacing: { before: 120, after: 40 },
      })
    );

    for (const highlight of role.highlights) {
      sections.push(bulletPoint(highlight));
    }
  }

  // Certifications (recent and relevant)
  sections.push(sectionHeading("Certifications & Professional Development"));
  const relevantCerts = profile.certifications_and_training.filter((c) =>
    jobKeywords.some((k) => c.name.toLowerCase().includes(k))
  );
  const recentCerts = profile.certifications_and_training
    .filter((c) => c.year >= 2021)
    .filter((c) => !relevantCerts.includes(c));
  const displayCerts = [...relevantCerts, ...recentCerts].slice(0, 12);

  for (const cert of displayCerts) {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${cert.name}`, size: 19, color: COLORS.text, font: "Calibri" }),
          new TextRun({ text: ` (${cert.year})`, size: 19, color: COLORS.muted, font: "Calibri" }),
        ],
        bullet: { level: 0 },
        spacing: { before: 10, after: 10 },
      })
    );
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.6),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        children: sections,
      },
    ],
  });
}

export function generateCoverLetter(
  analysis: AnalysisResult,
  profile: UserProfile,
  hiringManager?: string
): Document {
  const paragraphs: Paragraph[] = [];

  // Header
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: profile.personal.name,
          bold: true,
          size: 28,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ],
      spacing: { after: 20 },
    })
  );
  const contactLine = [
    profile.personal.address,
    [profile.personal.phone, profile.personal.email].filter(Boolean).join("  |  "),
  ]
    .filter(Boolean)
    .join("\n");
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: contactLine,
          size: 18,
          color: COLORS.muted,
          font: "Calibri",
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Date
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: dateStr, size: 20, color: COLORS.text, font: "Calibri" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Salutation
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Dear ${hiringManager || "Hiring Manager"},`,
          size: 21,
          color: COLORS.text,
          font: "Calibri",
        }),
      ],
      spacing: { after: 120 },
    })
  );

  // Opening paragraph - dynamic based on profile
  const yearsExp = profile.personal.years_experience;
  const companyMention =
    analysis.company !== "Target Company" ? ` at ${analysis.company}` : "";
  paragraphs.push(
    textParagraph(
      `I am writing to express my strong interest in the ${analysis.jobTitle} position${companyMention}. With ${yearsExp}+ years of progressive experience, I bring a proven track record of delivering the strategic outcomes and operational excellence this role demands.`
    )
  );

  // Dynamic evidence paragraphs built from strong/moderate matches
  const strongMatches = analysis.matches.filter(
    (m) => m.matchStrength === "strong" || m.matchStrength === "moderate"
  );

  for (const match of strongMatches.slice(0, 4)) {
    const topEvidence = match.evidence.slice(0, 3);
    if (topEvidence.length === 0) continue;

    // Build a paragraph from the category name and evidence strings
    const category = match.requirement.category;
    const evidenceSentences = topEvidence.map((e) => {
      // Strip the "Role @ Company: " prefix to make it read as prose
      const colonIdx = e.indexOf(": ");
      return colonIdx >= 0 ? e.substring(colonIdx + 2) : e;
    });

    const intro =
      match.matchStrength === "strong"
        ? `In the area of ${category}, my track record includes: `
        : `Regarding ${category}, my experience includes: `;

    paragraphs.push(textParagraph(intro + evidenceSentences.join(". ") + "."));
  }

  // If no strong/moderate matches, add a generic paragraph
  if (strongMatches.length === 0) {
    const allEvidence = analysis.matches
      .flatMap((m) => m.evidence)
      .slice(0, 3);
    if (allEvidence.length > 0) {
      paragraphs.push(
        textParagraph(
          `My experience directly aligns with the requirements of this role. ${allEvidence.join(". ")}.`
        )
      );
    }
  }

  // Closing
  const closingCompany =
    analysis.company !== "Target Company" ? analysis.company : "your organisation";
  paragraphs.push(
    textParagraph(
      `I am genuinely excited about the opportunity to bring my blend of hands-on technical delivery, strategic thinking, and people leadership to ${closingCompany}. I would welcome the chance to discuss how my experience can contribute to your team's success.`
    )
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Yours sincerely,",
          size: 21,
          color: COLORS.text,
          font: "Calibri",
        }),
      ],
      spacing: { before: 200, after: 80 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: profile.personal.name,
          bold: true,
          size: 22,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ],
    })
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
}

export function generateBriefing(
  analysis: AnalysisResult,
  profile: UserProfile,
  company: CompanyResearch,
  salary: SalaryResearch,
  hiringManager?: HiringManagerResearch
): Document {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Interview Briefing: ${analysis.jobTitle}`,
          bold: true,
          size: 32,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
    })
  );
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${company.companyName} | Prepared for ${profile.personal.name}`,
          size: 20,
          color: COLORS.muted,
          font: "Calibri",
        }),
      ],
      spacing: { after: 120 },
    })
  );
  paragraphs.push(divider());

  // Section 1: Company Snapshot
  paragraphs.push(sectionHeading("Company Snapshot"));
  paragraphs.push(bulletPoint(`Company: ${company.companyName}`));
  paragraphs.push(bulletPoint(`Industry: ${company.industry}`));
  paragraphs.push(bulletPoint(`Employees: ${company.employeeCount}`));
  paragraphs.push(bulletPoint(`Headquarters: ${company.headquarters}`));
  paragraphs.push(textParagraph(company.overview));
  if (company.recentNews.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Recent News:",
            bold: true,
            size: 20,
            color: COLORS.secondary,
            font: "Calibri",
          }),
        ],
        spacing: { before: 60, after: 40 },
      })
    );
    for (const news of company.recentNews.slice(0, 5)) {
      paragraphs.push(bulletPoint(news));
    }
  }

  // Section 2: Culture & Work Environment
  paragraphs.push(sectionHeading("Culture & Work Environment"));
  paragraphs.push(textParagraph(company.cultureSummary));
  paragraphs.push(bulletPoint(`Remote/WFH Policy: ${company.remoteWorkPolicy}`));
  paragraphs.push(bulletPoint(`WFH Resistance: ${company.wfhResistance}`));
  if (company.glassdoorRating) {
    paragraphs.push(bulletPoint(`Glassdoor Rating: ${company.glassdoorRating}`));
  }

  // Section 3: Role Market Position
  paragraphs.push(sectionHeading("Role Market Position"));
  paragraphs.push(bulletPoint(`Role: ${salary.jobTitle}`));
  paragraphs.push(
    bulletPoint(
      `NZ Range: $${(salary.nzRange.low / 1000).toFixed(0)}k - $${(salary.nzRange.high / 1000).toFixed(0)}k (median $${(salary.nzRange.median / 1000).toFixed(0)}k)`
    )
  );
  paragraphs.push(
    bulletPoint(
      `AU Range: $${(salary.auRange.low / 1000).toFixed(0)}k - $${(salary.auRange.high / 1000).toFixed(0)}k (median $${(salary.auRange.median / 1000).toFixed(0)}k)`
    )
  );
  if (salary.commonBenefits.length > 0) {
    paragraphs.push(bulletPoint(`Common Benefits: ${salary.commonBenefits.join(", ")}`));
  }
  paragraphs.push(textParagraph(salary.marketNotes));

  // Section 4: Hiring Manager Profile
  if (hiringManager) {
    paragraphs.push(sectionHeading("Hiring Manager Profile"));
    paragraphs.push(bulletPoint(`Name: ${hiringManager.name}`));
    if (hiringManager.linkedinSummary && !hiringManager.linkedinSummary.startsWith("Research pending")) {
      paragraphs.push(textParagraph(hiringManager.linkedinSummary));
    }
    if (hiringManager.knownDrivers.length > 0) {
      paragraphs.push(bulletPoint(`Known Focus Areas: ${hiringManager.knownDrivers.join(", ")}`));
    }
    if (hiringManager.articles.length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Published Content:", bold: true, size: 20, color: COLORS.secondary, font: "Calibri" }),
          ],
          spacing: { before: 60, after: 40 },
        })
      );
      for (const article of hiringManager.articles.slice(0, 3)) {
        paragraphs.push(bulletPoint(article.title + (article.url ? ` (${article.url})` : "")));
      }
    }
    if (hiringManager.conferences.length > 0) {
      paragraphs.push(bulletPoint(`Conference Activity: ${hiringManager.conferences.join("; ")}`));
    }
    paragraphs.push(sectionHeading("Alignment Strategy"));
    paragraphs.push(textParagraph(hiringManager.recommendedApproach));
  }

  // Section 5: Recommended Talking Points
  paragraphs.push(sectionHeading("Recommended Talking Points"));
  const strongMatches = analysis.matches.filter(
    (m) => m.matchStrength === "strong" || m.matchStrength === "moderate"
  );
  for (const match of strongMatches.slice(0, 5)) {
    const topEvidence = match.evidence[0];
    if (topEvidence) {
      paragraphs.push(
        bulletPoint(`${match.requirement.category}: ${topEvidence}`)
      );
    }
  }
  // Add gap-based talking points
  if (analysis.missingSkills.length > 0) {
    paragraphs.push(
      textParagraph(
        `Be prepared to address gaps in: ${analysis.missingSkills.join(", ")}. Frame these as areas of active learning or adjacent experience.`
      )
    );
  }

  // Section 5: Priority Benefits Match
  if (analysis.benefitMatches && analysis.benefitMatches.length > 0) {
    paragraphs.push(sectionHeading("Priority Benefits Match"));
    for (const b of analysis.benefitMatches) {
      const status = b.found ? "\u2713" : "\u2717";
      const line = `${status} ${b.keyword} (Priority #${b.priority})${b.found && b.context ? ` — ${b.context}` : ""}`;
      paragraphs.push(bulletPoint(line));
    }
  }

  // Section 6: Location
  if (analysis.officeLocation && analysis.officeLocation !== "Not specified") {
    paragraphs.push(sectionHeading("Role Location"));
    paragraphs.push(textParagraph(`Detected location: ${analysis.officeLocation}`));
  }

  // Section 7: Your Match Summary
  paragraphs.push(sectionHeading("Your Match Summary"));
  paragraphs.push(
    bulletPoint(`Overall Match: ${analysis.matchPercentage}%`)
  );
  const strongCount = analysis.matches.filter((m) => m.matchStrength === "strong").length;
  const modCount = analysis.matches.filter((m) => m.matchStrength === "moderate").length;
  const weakCount = analysis.matches.filter((m) => m.matchStrength === "weak").length;
  paragraphs.push(
    bulletPoint(`Strong matches: ${strongCount} | Moderate: ${modCount} | Weak: ${weakCount}`)
  );
  paragraphs.push(textParagraph(analysis.tailoredSummary));

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
}
