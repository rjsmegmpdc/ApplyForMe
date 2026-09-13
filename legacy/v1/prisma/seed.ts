import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import bcryptjs from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const profilePath = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "master-profile.json"
  );
  const raw = fs.readFileSync(profilePath, "utf-8");
  const profile = JSON.parse(raw);

  // Check if Matt already exists
  const existing = await prisma.user.findFirst({
    where: { name: profile.personal.name },
  });
  if (existing) {
    console.log(`User "${profile.personal.name}" already exists (id: ${existing.id}). Skipping seed.`);
    return;
  }

  // Default PIN: 123456
  const hashedPin = await bcryptjs.hash("123456", 12);

  const user = await prisma.user.create({
    data: {
      name: profile.personal.name,
      email: profile.personal.email_personal,
      pin: hashedPin,
      role: "ADMIN",
      emailVerified: new Date(),
      phone: profile.personal.phone,
      address: profile.personal.address,
      linkedin: profile.personal.linkedin || null,
      nationality: profile.personal.nationality,
      yearsExperience: profile.personal.years_experience,
      executiveSummary: profile.executive_summary,
    },
  });

  console.log(`Created user: ${user.name} (id: ${user.id})`);

  // Core competencies
  for (let i = 0; i < profile.core_competencies.length; i++) {
    await prisma.coreCompetency.create({
      data: {
        userId: user.id,
        competency: profile.core_competencies[i],
        sortOrder: i,
      },
    });
  }
  console.log(`  Added ${profile.core_competencies.length} competencies`);

  // Career history
  for (let i = 0; i < profile.career_history.length; i++) {
    const role = profile.career_history[i];
    const entry = await prisma.careerEntry.create({
      data: {
        userId: user.id,
        title: role.title,
        company: role.company,
        location: role.location || "",
        startDate: role.start_date,
        endDate: role.end_date,
        sortOrder: i,
      },
    });

    for (let j = 0; j < role.highlights.length; j++) {
      await prisma.careerHighlight.create({
        data: {
          careerEntryId: entry.id,
          highlight: role.highlights[j],
          sortOrder: j,
        },
      });
    }

    for (const kw of role.keywords) {
      await prisma.careerKeyword.create({
        data: {
          careerEntryId: entry.id,
          keyword: kw,
        },
      });
    }
  }
  console.log(`  Added ${profile.career_history.length} career entries`);

  // Certifications
  for (let i = 0; i < profile.certifications_and_training.length; i++) {
    const cert = profile.certifications_and_training[i];
    await prisma.certification.create({
      data: {
        userId: user.id,
        name: cert.name,
        year: cert.year,
        sortOrder: i,
      },
    });
  }
  console.log(`  Added ${profile.certifications_and_training.length} certifications`);

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
