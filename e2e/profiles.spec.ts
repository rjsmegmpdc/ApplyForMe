import path from "node:path";
import fs from "node:fs";
import { test, expect, asRole, createApplication } from "./support/fixtures";
import { fieldByLabel } from "./support/helpers";
import type { APIRequestContext, Page } from "@playwright/test";

// Profiles list, create, edit (every editable section), import and delete.

test.use(asRole("admin"));

async function createProfileViaApi(request: APIRequestContext, name: string, email?: string) {
  const res = await request.post("/api/profiles", {
    data: { name, email: email ?? `${name.replace(/\W+/g, ".").toLowerCase()}@e2e.test` },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}

/**
 * The app caps the database at 10 users, so the editing tests share one
 * scratch profile and reset it to a known blank state before each use.
 */
let scratchId = "";
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext(asRole("admin"));
  // Reuse it if a previous worker in this run already created it.
  const existing = ((await (await ctx.request.get("/api/profiles")).json()) as { id: string; email: string }[]).find(
    (p) => p.email === "scratch@e2e.test"
  );
  scratchId = existing?.id ?? (await createProfileViaApi(ctx.request, "Scratch Sam", "scratch@e2e.test"));
  await ctx.close();
});

async function resetScratch(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}) {
  const res = await request.put(`/api/profiles/${scratchId}`, {
    data: {
      personal: { name, email: "scratch@e2e.test", phone: "", address: "", years_experience: 0 },
      executive_summary: "",
      core_competencies: [],
      career_history: [],
      certifications_and_training: [],
      ...extra,
    },
  });
  expect(res.ok()).toBeTruthy();
  await request.put(`/api/profiles/${scratchId}/benefits`, { data: { benefits: [] } });
  return scratchId;
}

/** A white "card" section of the editor, identified by its heading. */
function section(page: Page, heading: string | RegExp) {
  return page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: heading }) }).last();
}

/**
 * Open the profile editor and wait for its data to settle. In dev mode React
 * StrictMode runs the load effect twice, and the second response would
 * overwrite anything typed in the meantime.
 */
async function openEditor(page: Page, id: string) {
  await page.goto(`/profiles/${id}`);
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

function profileRow(page: Page, name: string) {
  return page.locator("div.p-5", { has: page.getByRole("heading", { name, exact: true }) });
}

test("list shows seeded profiles with role and links to Add Profile", async ({ page }) => {
  await page.goto("/profiles");
  const admin = profileRow(page, "E2E Admin");
  await expect(admin).toContainText("admin@e2e.test");
  await expect(admin).toContainText("Role: ADMIN");
  await expect(profileRow(page, "E2E Viewer")).toContainText("Role: VIEWER");

  await page.getByRole("link", { name: "+ Add Profile" }).click();
  await expect(page).toHaveURL(/\/profiles\/new$/);
  await expect(page.getByRole("heading", { name: "New Profile" })).toBeVisible();
});

test("new profile form validates, submits and opens the editor with saved values", async ({ page }) => {
  await page.goto("/profiles/new");
  const create = page.getByRole("button", { name: "Create Profile" });
  await expect(create).toBeDisabled();

  await page.getByPlaceholder("e.g. Jane Smith").fill("   ");
  await expect(create).toBeDisabled(); // whitespace-only name

  await page.getByPlaceholder("e.g. Jane Smith").fill("Nora New");
  await page.getByPlaceholder("jane@email.com").fill("nora@e2e.test");
  await page.getByPlaceholder("021 xxx xxxx").fill("021 555 1234");
  await page.getByPlaceholder("e.g. Auckland, New Zealand").fill("Hamilton, New Zealand");
  await page.getByPlaceholder("e.g. New Zealand").fill("Australia");
  await page.getByPlaceholder("e.g. 15").fill("12");
  await page.getByPlaceholder("Brief professional summary...").fill("Pragmatic engineering leader.");
  await expect(create).toBeEnabled();
  await create.click();

  await expect(page).toHaveURL(/\/profiles\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();
  await expect(fieldByLabel(page, "Name")).toHaveValue("Nora New");
  await expect(fieldByLabel(page, "Email")).toHaveValue("nora@e2e.test");
  await expect(fieldByLabel(page, "Phone")).toHaveValue("021 555 1234");
  await expect(fieldByLabel(page, "Address")).toHaveValue("Hamilton, New Zealand");
  await expect(fieldByLabel(page, "Years Experience")).toHaveValue("12");
  await expect(fieldByLabel(page, "Executive Summary")).toHaveValue("Pragmatic engineering leader.");

  await page.getByRole("button", { name: "Back to Profiles" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(profileRow(page, "Nora New")).toContainText("Role: USER");
});

test("new profile Cancel returns to the list", async ({ page }) => {
  await page.goto("/profiles/new");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
});

test("editing every section and saving persists after reload", async ({ page }) => {
  const id = await resetScratch(page.request, "Eddie Edit");
  await page.goto("/profiles");
  await profileRow(page, "Eddie Edit").getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`/profiles/${id}$`));
  await page.waitForLoadState("networkidle");

  // Personal info
  await fieldByLabel(page, "Name").fill("Eddie Edited");
  await fieldByLabel(page, "Phone").fill("027 111 2222");
  await fieldByLabel(page, "Years Experience").fill("9");
  await fieldByLabel(page, "Executive Summary").fill("Updated summary text.");

  // Competencies: add via button and via Enter, then remove one
  const competencyInput = page.getByPlaceholder("Add competency...");
  const competencies = section(page, "Core Competencies");
  await competencyInput.fill("Kubernetes");
  await competencies.getByRole("button", { name: "Add" }).click();
  await expect(competencyInput).toHaveValue("");
  await competencyInput.fill("Vendor Management");
  await competencyInput.press("Enter");
  await competencyInput.fill("Throwaway");
  await competencyInput.press("Enter");
  await expect(competencies.locator("span.rounded-full")).toHaveText(["Kubernetes×", "Vendor Management×", "Throwaway×"]);
  await competencies.locator("span.rounded-full", { hasText: "Throwaway" }).getByRole("button").click();
  await expect(competencies.locator("span.rounded-full")).toHaveText(["Kubernetes×", "Vendor Management×"]);

  // Priority benefits: ranked, and re-ranked on removal
  const benefitInput = page.getByPlaceholder("e.g. remote, kiwisaver, health insurance...");
  const benefits = section(page, "Priority Benefits");
  await benefitInput.fill("health insurance");
  await benefitInput.press("Enter");
  await benefitInput.fill("remote");
  await benefits.getByRole("button", { name: "Add" }).click();
  await expect(benefits.locator("div.bg-slate-50")).toHaveText(["#1health insurance×", "#2remote×"]);
  await benefits.locator("div.bg-slate-50", { hasText: "health insurance" }).getByRole("button").click();
  await expect(benefits.locator("div.bg-slate-50")).toHaveText(["#1remote×"]);

  // Career history: add role, fill fields, add + edit a highlight, keywords
  const career = section(page, "Career History");
  await expect(career.getByText("No career entries yet.")).toBeVisible();
  await career.getByRole("button", { name: "+ Add Role" }).click();
  await career.getByPlaceholder("Job Title").fill("Platform Lead");
  await career.getByPlaceholder("Company").fill("Kiwi Cloud");
  await career.getByPlaceholder("Start (e.g. 2021)").fill("2020");
  await career.getByPlaceholder("End (e.g. Present)").fill("Present");
  await career.getByPlaceholder("Location").fill("Wellington");
  await career.getByRole("button", { name: "+ Add highlight" }).click();
  const highlight = career.locator("input:not([placeholder])").first();
  await highlight.fill("Cut hosting costs by 30%");
  await career.getByPlaceholder("e.g. AI, Copilot, Azure, Leadership").fill("Azure, Terraform");

  // Certifications: add via button (with year) and via Enter (defaults to current year)
  const certs = section(page, "Certifications & Training");
  await expect(certs.getByText("No certifications yet.")).toBeVisible();
  await certs.getByPlaceholder("Certification name...").fill("AZ-305");
  await certs.getByPlaceholder("Year").last().fill("2023");
  await certs.getByRole("button", { name: "Add" }).click();
  await certs.getByPlaceholder("Certification name...").fill("CISSP");
  await certs.getByPlaceholder("Certification name...").press("Enter");
  const certRows = certs.locator("div.bg-slate-50");
  await expect(certRows).toHaveCount(2);
  await expect(certRows.nth(0).locator("input").first()).toHaveValue("AZ-305");
  await expect(certRows.nth(0).locator("input").nth(1)).toHaveValue("2023");
  await expect(certRows.nth(1).locator("input").nth(1)).toHaveValue(String(new Date().getFullYear()));

  await page.getByRole("button", { name: "Save Profile" }).click();
  await expect(page.getByText("Profile saved successfully")).toBeVisible();

  await openEditor(page, id);
  await expect(fieldByLabel(page, "Name")).toHaveValue("Eddie Edited");
  await expect(fieldByLabel(page, "Phone")).toHaveValue("027 111 2222");
  await expect(fieldByLabel(page, "Years Experience")).toHaveValue("9");
  await expect(fieldByLabel(page, "Executive Summary")).toHaveValue("Updated summary text.");
  await expect(competencies.locator("span.rounded-full")).toHaveText(["Kubernetes×", "Vendor Management×"]);
  await expect(benefits.locator("div.bg-slate-50")).toHaveText(["#1remote×"]);
  await expect(career.getByPlaceholder("Job Title")).toHaveValue("Platform Lead");
  await expect(career.getByPlaceholder("Company")).toHaveValue("Kiwi Cloud");
  await expect(career.getByPlaceholder("Location")).toHaveValue("Wellington");
  await expect(career.locator("input:not([placeholder])").first()).toHaveValue("Cut hosting costs by 30%");
  await expect(career.getByPlaceholder("e.g. AI, Copilot, Azure, Leadership")).toHaveValue("Azure, Terraform");
  await expect(certRows).toHaveCount(2);
});

test("removing a career role and a certification before saving drops them", async ({ page }) => {
  const id = await resetScratch(page.request, "Rita Remove", {
    career_history: [{ title: "Old Job", company: "Old Co", start_date: "2010", end_date: "2012", highlights: ["x"], keywords: [] }],
    certifications_and_training: [{ name: "Old Cert", year: 2011 }],
  });
  await openEditor(page, id);
  const career = section(page, "Career History");
  await expect(career.getByPlaceholder("Job Title")).toHaveValue("Old Job");
  await career.getByRole("button", { name: "Remove" }).click();
  await expect(career.getByText("No career entries yet.")).toBeVisible();

  const certs = section(page, "Certifications & Training");
  await certs.locator("div.bg-slate-50").getByRole("button").click();
  await expect(certs.getByText("No certifications yet.")).toBeVisible();

  await page.getByRole("button", { name: "Save Profile" }).click();
  await expect(page.getByText("Profile saved successfully")).toBeVisible();
  await page.reload();
  await expect(career.getByText("No career entries yet.")).toBeVisible();
  await expect(certs.getByText("No certifications yet.")).toBeVisible();
});

test("editor Cancel and Import from File links navigate", async ({ page }) => {
  const id = await resetScratch(page.request, "Nav Nick");
  await openEditor(page, id);
  await page.getByRole("link", { name: "Import from File" }).click();
  await expect(page).toHaveURL(new RegExp(`/profiles/${id}/import$`));
  await page.getByRole("button", { name: "Back to Profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/profiles/${id}$`));
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
});

// BUG: the Anki format buttons send PUT /api/profiles/[id] { ankiExportFormat },
// but that route never reads body.ankiExportFormat, so the choice is silently
// discarded (and the buttons show no selected state either). Choosing
// ".apkg only" should make "Download Anki Deck" produce just the .apkg file.
test.fail("Anki export format choice is applied to deck downloads", async ({ page }) => {
  const id = await resetScratch(page.request, "Anki Annie");
  const { applicationId } = await createApplication(page.request, id, "Deck Role", "Deck Co");

  await openEditor(page, id);
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/profiles/${id}`) && r.request().method() === "PUT");
  await page.getByRole("button", { name: ".apkg only" }).click();
  await saved;

  await page.goto(`/history/${applicationId}`);
  const files: string[] = [];
  page.on("download", (d) => files.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Download Anki Deck" }).click();
  await expect(page.getByRole("button", { name: "Download Anki Deck" })).toBeEnabled();
  await page.waitForTimeout(1_000);
  expect(files).toEqual(["Deck_Role_anki.apkg"]);
});

test("import: pick a JSON file, review/edit parsed data, save to profile", async ({ page }, testInfo) => {
  const id = await resetScratch(page.request, "Ivy Import");
  const file = testInfo.outputPath("profile.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      personal: { name: "Ivy Imported", email_personal: "ivy@e2e.test", phone: "022 333 4444", address: "Dunedin" },
      executive_summary: "Imported summary.",
      core_competencies: ["Data Strategy", "Governance", "Delete Me"],
      career_history: [
        { title: "Data Lead", company: "Southern Data", location: "Dunedin", start_date: "2019", end_date: "Present", highlights: ["Built the lakehouse", "Hired 8 engineers"], keywords: ["Data"] },
        { title: "Analyst", company: "Old Analytics", location: "", start_date: "2015", end_date: "2019", highlights: [], keywords: [] },
      ],
      certifications_and_training: [{ name: "CDMP", year: 2021 }],
    })
  );

  await page.goto(`/profiles/${id}/import`);
  await expect(page.getByRole("button", { name: "Upload & Parse" })).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(path.basename(file))).toBeVisible();
  await page.getByRole("button", { name: "Upload & Parse" }).click();

  await expect(page.getByText("File parsed successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Core Competencies (3)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Career History (2 roles)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certifications (1)" })).toBeVisible();
  await expect(fieldByLabel(page, "Name")).toHaveValue("Ivy Imported");

  // Edit before saving: rename, drop a competency, drop a role, edit a highlight.
  await fieldByLabel(page, "Name").fill("Ivy Reviewed");
  await page.locator("span.rounded-full", { hasText: "Delete Me" }).getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Core Competencies (2)" })).toBeVisible();
  await page.getByRole("button", { name: "× Remove" }).nth(1).click();
  await expect(page.getByRole("heading", { name: "Career History (1 roles)" })).toBeVisible();
  await page.locator('input[value="Hired 8 engineers"]').fill("Hired 10 engineers");

  await page.getByRole("button", { name: "Save to Profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/profiles/${id}$`));
  await expect(fieldByLabel(page, "Name")).toHaveValue("Ivy Reviewed");
  await expect(fieldByLabel(page, "Email")).toHaveValue("ivy@e2e.test");
  const competencies = section(page, "Core Competencies");
  await expect(competencies.locator("span.rounded-full")).toHaveText(["Data Strategy×", "Governance×"]);
  const career = section(page, "Career History");
  await expect(career.getByPlaceholder("Job Title")).toHaveValue("Data Lead");
  await expect(career.locator('input[value="Hired 10 engineers"]')).toBeVisible();
});

test("import: Upload Different File resets the preview", async ({ page }, testInfo) => {
  const id = await resetScratch(page.request, "Uma Upload");
  const file = testInfo.outputPath("cv.txt");
  fs.writeFileSync(file, "Uma Upload\numa@e2e.test\n\nExperience\nEngineer at Foo 2020 - Present\n");
  await page.goto(`/profiles/${id}/import`);
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "Upload & Parse" }).click();
  await expect(page.getByText("File parsed successfully.")).toBeVisible();
  await page.getByRole("button", { name: "Upload Different File" }).click();
  await expect(page.getByText("Click to select a file or drag and drop")).toBeVisible();
});

test("delete asks for confirmation; dismiss keeps, accept removes the profile", async ({ page }) => {
  await createProfileViaApi(page.request, "Dora Delete");
  await page.goto("/profiles");
  const row = profileRow(page, "Dora Delete");
  await expect(row).toBeVisible();

  page.once("dialog", (d) => {
    expect(d.message()).toBe("Delete this profile and all its data?");
    return d.dismiss();
  });
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Admin", exact: true })).toBeVisible();
  await expect(profileRow(page, "Dora Delete")).toHaveCount(0);
});
