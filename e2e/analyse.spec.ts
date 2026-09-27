import { test, expect, asRole } from "./support/fixtures";
import { fieldByLabel, jobDescription } from "./support/helpers";
import type { Page } from "@playwright/test";

// The main "Job Analysis" page: profile select + job text drive the Analyse
// button, analysis renders, and every follow-up action does its job.
//
// Company research and hiring-manager research scrape third-party websites
// (LinkedIn, company sites) from the server, so those two endpoints are
// stubbed at the browser boundary. Everything else (analysis, salary data,
// interview notes, email in console mode, Anki generation) runs for real.

test.use(asRole("admin"));

const TITLE = "Head of AI";
const COMPANY = "Acme Robotics";

async function stubExternalResearch(page: Page) {
  await page.route("**/api/research/company", (route) =>
    route.fulfill({
      json: {
        companyName: COMPANY,
        industry: "Robotics",
        employeeCount: "200-500",
        headquarters: "Auckland",
        officeLocations: ["Auckland"],
        roleLocation: "Auckland",
        overview: "Acme Robotics builds warehouse robots.",
        cultureSummary: "Engineering-led",
        remoteWorkPolicy: "Hybrid, 2 days in office",
        wfhResistance: "low",
        recentNews: [],
        glassdoorRating: "4.1",
      },
    })
  );
  await page.route("**/api/research/hiring-manager", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        name: body.name,
        linkedinSummary: `${body.name} leads technology at ${body.company}.`,
        knownDrivers: ["Delivery at pace"],
        articles: [],
        conferences: [],
        recommendedApproach: "Lead with measurable AI outcomes.",
      },
    });
  });
}

async function runAnalysis(page: Page, jobText = jobDescription(TITLE, COMPANY)) {
  await page.goto("/");
  const profile = fieldByLabel(page, "Profile");
  await expect(profile.locator("option", { hasText: "E2E Admin" })).toBeAttached();
  await profile.selectOption({ label: "E2E Admin" });
  await page.getByPlaceholder("Paste the full job description").fill(jobText);
  await page.getByRole("button", { name: "Analyse & Match" }).click();
  await expect(page.getByRole("heading", { name: "Match Analysis" })).toBeVisible();
}

test("Analyse button is gated on profile selection and job text", async ({ page }) => {
  await page.goto("/");
  const analyse = page.getByRole("button", { name: "Analyse & Match" });
  const profile = fieldByLabel(page, "Profile");
  const jobText = page.getByPlaceholder("Paste the full job description");

  // Admin's own profile is pre-selected once profiles load.
  await expect(profile).toHaveValue(/.+/);
  await expect(profile.locator("option:checked")).toHaveText("E2E Admin");
  await expect(analyse).toBeDisabled(); // no text yet

  await jobText.fill("   ");
  await expect(analyse).toBeDisabled(); // whitespace only

  await jobText.fill("Role: Something");
  await expect(analyse).toBeEnabled();

  await profile.selectOption("");
  await expect(profile.locator("option:checked")).toHaveText("Select a profile...");
  await expect(analyse).toBeDisabled();

  await profile.selectOption({ label: "E2E User" });
  await expect(profile.locator("option:checked")).toHaveText("E2E User");
  await expect(analyse).toBeEnabled();

  const hm = page.getByPlaceholder("e.g. Sarah Thompson");
  await hm.fill("Jane Doe");
  await expect(hm).toHaveValue("Jane Doe");
});

test("analysis shows title, company, location, score, benefits and summary", async ({ page }) => {
  await runAnalysis(page);
  await expect(page.getByText(`${TITLE} @ ${COMPANY}`)).toBeVisible();
  await expect(page.getByRole("paragraph").filter({ hasText: /^Location:/ })).toContainText("Auckland");
  await expect(page.getByText(/^\d{1,3}%$/).first()).toBeVisible();

  const benefits = page.locator("div", { has: page.getByRole("heading", { name: "Your Priority Benefits" }) }).last();
  await expect(benefits).toContainText("remote");
  await expect(benefits).toContainText("Priority #1");
  await expect(benefits).toContainText("kiwisaver");
  await expect(benefits).toContainText("Priority #2");
  await expect(benefits.getByText("✓")).toHaveCount(2); // both found in the JD

  const summary = page.locator("div", { has: page.getByRole("heading", { name: "Tailored Executive Summary" }) }).last();
  await expect(summary).toContainText(`${TITLE} role at ${COMPANY}`);

  // The analysis is saved to history.
  await page.getByRole("navigation").getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("link", { name: TITLE }).first()).toBeVisible();
});

test("Research button loads company + salary briefing and unlocks the briefing download", async ({ page }) => {
  await stubExternalResearch(page);
  await runAnalysis(page);
  await expect(page.getByRole("button", { name: "Briefing (.docx)" })).toHaveCount(0);

  await page.getByRole("button", { name: `Research ${COMPANY}` }).click();
  const briefing = page.locator("div", { has: page.getByRole("heading", { name: "Recruiter Briefing" }) }).last();
  await expect(briefing).toContainText("Acme Robotics builds warehouse robots.");
  await expect(briefing).toContainText("Industry: Robotics");
  await expect(briefing).toContainText("WFH Resistance: low");
  await expect(briefing).toContainText(/NZ: \$[\d,]+ - \$[\d,]+/); // real salary lookup
  await expect(page.getByRole("button", { name: `Research ${COMPANY}` })).toHaveCount(0);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Briefing (.docx)" }).click();
  expect((await download).suggestedFilename()).toBe("E2E_Admin_Briefing_Acme_Robotics.docx");
});

test("interview prep: answers are editable and saving updates location and hiring manager", async ({ page }) => {
  await stubExternalResearch(page);
  await runAnalysis(page);
  await page.getByRole("button", { name: "Prepare Interview Questions" }).click();
  await expect(page.getByRole("heading", { name: "Phone Interview Prep" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare Interview Questions" })).toHaveCount(0);

  const answers = page.getByPlaceholder("Enter answer...");
  expect(await answers.count()).toBeGreaterThan(3);

  // Find the question inputs by their question text.
  const answerFor = (q: RegExp) =>
    page.locator("div.bg-slate-50", { has: page.getByText(q) }).getByPlaceholder("Enter answer...");
  const location = answerFor(/^Can you confirm the role location/);
  const manager = answerFor(/^Who is the hiring manager for this position\?$/);
  await location.fill("Wellington waterfront");
  await expect(location).toHaveValue("Wellington waterfront");
  await manager.fill("Jane Doe");

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/interviews") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save Notes & Research Hiring Manager" }).click();
  expect((await saved).ok()).toBeTruthy();

  await expect(page.getByRole("paragraph").filter({ hasText: /^Location:/ })).toContainText("Wellington waterfront");
  await expect(page.getByRole("heading", { name: "Hiring Manager: Jane Doe" })).toBeVisible();
  await expect(page.getByText("Lead with measurable AI outcomes.")).toBeVisible();
});

test("CV and cover letter download as named .docx files", async ({ page }) => {
  await runAnalysis(page);
  const cv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CV (.docx)" }).click();
  expect((await cv).suggestedFilename()).toBe("E2E_Admin_CV_Acme_Robotics.docx");

  const letter = page.waitForEvent("download");
  await page.getByRole("button", { name: "Cover Letter (.docx)" }).click();
  expect((await letter).suggestedFilename()).toBe("E2E_Admin_Cover_Letter_Acme_Robotics.docx");
});

test("Anki Deck downloads both .apkg and .txt by default", async ({ page }) => {
  await runAnalysis(page);
  const files: string[] = [];
  page.on("download", (d) => files.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Anki Deck" }).click();
  await expect.poll(() => files.sort()).toEqual(["Head_of_AI_Acme_Robotics.apkg", "Head_of_AI_Acme_Robotics_anki.txt"]);
});

test("Email Application: prefilled, validates recipient, sends and cancels", async ({ page }) => {
  await runAnalysis(page);
  await page.getByRole("button", { name: "Email Application" }).click();
  const panel = page.locator("div", { has: page.getByRole("heading", { name: "Email Application" }) }).last();
  await expect(fieldByLabel(panel, "Subject")).toHaveValue(`Application: ${TITLE} — E2E Admin`);
  await expect(fieldByLabel(panel, "Message")).toHaveValue(/Dear Hiring Manager,[\s\S]*Head of AI position/);

  const send = panel.getByRole("button", { name: "Send Email" });
  await expect(send).toBeDisabled();
  await panel.getByPlaceholder("recruiter@company.com").fill("recruiter@acme.example");
  await fieldByLabel(panel, "Subject").fill("My application");
  await expect(fieldByLabel(panel, "Subject")).toHaveValue("My application");
  await expect(send).toBeEnabled();

  await send.click();
  await expect(panel.getByText("Email sent successfully!")).toBeVisible();

  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Email Application" })).toHaveCount(0);
});
