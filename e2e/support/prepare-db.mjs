// Creates a fresh, isolated SQLite database for the Playwright e2e suite and
// seeds deterministic test accounts. Run automatically by playwright.config.ts
// (webServer.command) before `next dev` starts; never touches prisma/applyforme.db.
//
//   DATABASE_URL=file:$PWD/e2e/.tmp/e2e.db node e2e/support/prepare-db.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const USERS = JSON.parse(fs.readFileSync(path.join(here, "users.json"), "utf8"));

// Must match E2E_DB_FILE in constants.ts; playwright.config.ts passes it as
// DATABASE_URL to both this script and the Next.js server.
const E2E_DB_URL = process.env.DATABASE_URL || `file:${path.resolve(here, "..", ".tmp", "e2e.db")}`;
if (!E2E_DB_URL.startsWith("file:")) throw new Error(`Refusing to reset non-SQLite DATABASE_URL: ${E2E_DB_URL}`);
const E2E_DB_FILE = E2E_DB_URL.slice("file:".length);
if (!E2E_DB_FILE.includes(`${path.sep}e2e${path.sep}.tmp${path.sep}`)) {
  throw new Error(`Refusing to reset a database outside e2e/.tmp: ${E2E_DB_FILE}`);
}
const tmpDir = path.dirname(E2E_DB_FILE);
fs.mkdirSync(tmpDir, { recursive: true });

// Start from an empty file every run.
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  fs.rmSync(E2E_DB_FILE + suffix, { force: true });
}

// prisma/schema.prisma hard-codes the dev database path, and Prisma 6's
// `db push` has no --url flag, so push a copy of the schema that points at the
// e2e database instead.
const schemaSrc = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const schemaCopy = schemaSrc.replace(/url\s*=\s*"file:[^"]*"/, `url = "${E2E_DB_URL}"`);
if (schemaCopy === schemaSrc) throw new Error("Could not rewrite datasource url in prisma/schema.prisma");
const schemaPath = path.join(tmpDir, "schema.prisma");
fs.writeFileSync(schemaPath, schemaCopy);

execFileSync(
  process.execPath,
  [path.join(root, "node_modules", "prisma", "build", "index.js"), "db", "push", "--skip-generate", `--schema=${schemaPath}`],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] }
);

const prisma = new PrismaClient({ datasourceUrl: E2E_DB_URL });

const master = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "master-profile.json"), "utf8")
);

async function createUser(u, { withCareer = false } = {}) {
  const user = await prisma.user.create({
    data: {
      name: u.name,
      email: u.email,
      pin: await bcryptjs.hash(u.pin, 4),
      role: u.role,
      emailVerified: new Date(),
      phone: "021 000 0000",
      address: "Auckland, New Zealand",
      nationality: "New Zealand",
      yearsExperience: withCareer ? master.personal.years_experience : 5,
      executiveSummary: withCareer ? master.executive_summary : `${u.name} test summary`,
    },
  });
  if (!withCareer) return user;

  for (const [i, c] of master.core_competencies.entries()) {
    await prisma.coreCompetency.create({ data: { userId: user.id, competency: c, sortOrder: i } });
  }
  for (const [i, role] of master.career_history.entries()) {
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
    for (const [j, h] of role.highlights.entries()) {
      await prisma.careerHighlight.create({ data: { careerEntryId: entry.id, highlight: h, sortOrder: j } });
    }
    for (const kw of role.keywords) {
      await prisma.careerKeyword.create({ data: { careerEntryId: entry.id, keyword: kw } });
    }
  }
  for (const [i, cert] of master.certifications_and_training.entries()) {
    await prisma.certification.create({
      data: { userId: user.id, name: cert.name, year: cert.year, sortOrder: i },
    });
  }
  await prisma.priorityBenefit.createMany({
    data: [
      { userId: user.id, keyword: "remote", priority: 1 },
      { userId: user.id, keyword: "kiwisaver", priority: 2 },
    ],
  });
  return user;
}

await createUser(USERS.admin, { withCareer: true });
await createUser(USERS.user, { withCareer: true });
for (const key of ["viewer", "lockout", "recover"]) {
  await createUser(USERS[key]);
}

await prisma.$disconnect();
console.log(`[e2e] database ready at ${E2E_DB_FILE}`);
