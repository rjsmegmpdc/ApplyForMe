import { test, expect, asRole, profileIdFor, createApplication, USERS } from "./support/fixtures";
import type { Page } from "@playwright/test";

// Application history list/detail (status select, re-downloads, Anki) and the
// analytics dashboard numbers that those applications drive. Runs as the
// regular user, whose applications no other spec creates.

test.describe.configure({ mode: "serial" });
test.use(asRole("user"));

function kpi(page: Page, label: string) {
  // KPI labels are <p> elements; the pipeline card reuses the same words in <span>s.
  return page.locator("div.rounded-xl", { has: page.locator("p", { hasText: new RegExp(`^${label}$`) }) });
}

test("empty states before any applications exist", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByText("No applications yet. Analyse a job to get started.")).toBeVisible();
  await page.goto("/analytics");
  await expect(kpi(page, "Total Applications")).toContainText("0");
  await expect(page.getByText("No applications yet")).toBeVisible();
});

test("history lists analysed jobs and the detail page works end to end", async ({ page }) => {
  const userId = await profileIdFor(page.request, USERS.user.name);
  const first = await createApplication(page.request, userId, "Head of Data", "Harbour Health");
  const second = await createApplication(page.request, userId, "Director of Platforms", "Tui Telecom");

  await page.goto("/history");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  // Newest first
  await expect(rows.nth(0)).toContainText("Director of Platforms");
  await expect(rows.nth(0)).toContainText("Tui Telecom");
  await expect(rows.nth(0)).toContainText(`${second.matchPercentage}%`);
  await expect(rows.nth(1)).toContainText("Head of Data");
  await expect(rows.nth(1)).toContainText(`${first.matchPercentage}%`);

  // Clicking anywhere on the row opens the detail page
  await rows.nth(1).getByText("Harbour Health").click();
  await expect(page).toHaveURL(new RegExp(`/history/${first.applicationId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Head of Data" })).toBeVisible();
  await expect(page.getByText(/Harbour Health · .* · Auckland/)).toBeVisible();
  await expect(page.getByText(`${first.matchPercentage}%`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tailored Summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priority Benefits" })).toBeVisible();

  // Re-download documents
  const cv = page.waitForEvent("download");
  await page.getByRole("button", { name: "CV (.docx)" }).click();
  expect((await cv).suggestedFilename()).toBe("E2E_User_CV_Harbour_Health.docx");
  const letter = page.waitForEvent("download");
  await page.getByRole("button", { name: "Cover Letter (.docx)" }).click();
  expect((await letter).suggestedFilename()).toBe("E2E_User_Cover_Letter_Harbour_Health.docx");
  // No research was run, so no briefing download is offered.
  await expect(page.getByRole("button", { name: "Briefing (.docx)" })).toHaveCount(0);

  // Anki deck
  const files: string[] = [];
  page.on("download", (d) => files.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Download Anki Deck" }).click();
  await expect.poll(() => [...files].sort()).toEqual(["Head_of_Data_anki.apkg", "Head_of_Data_anki.txt"]);

  // Link title also navigates, and Back to History returns
  await page.getByRole("link", { name: "Back to History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.getByRole("link", { name: "Director of Platforms" }).click();
  await expect(page).toHaveURL(new RegExp(`/history/${second.applicationId}$`));
});

test("status select updates the application and the analytics pipeline", async ({ page }) => {
  await page.goto("/analytics");
  await expect(kpi(page, "Total Applications")).toContainText("2");
  await expect(kpi(page, "Applied")).toContainText("0");
  await expect(kpi(page, "Applied")).toContainText("2 analysed only");
  const topCompanies = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "Top Companies" }) });
  await expect(topCompanies).toContainText("Harbour Health");
  await expect(topCompanies).toContainText("Tui Telecom");

  await page.goto("/history");
  await page.getByRole("link", { name: "Head of Data" }).click();
  const status = page.getByRole("combobox");
  await expect(status.locator("option:checked")).toHaveText("Analysed");
  const saved = page.waitForResponse((r) => /\/api\/applications\/[^/]+$/.test(r.url()) && r.request().method() === "PUT");
  await status.selectOption({ label: "Applied" });
  expect((await saved).ok()).toBeTruthy();
  await expect(status.locator("option:checked")).toHaveText("Applied");

  await page.reload();
  await expect(page.getByRole("combobox").locator("option:checked")).toHaveText("Applied");

  const saved2 = page.waitForResponse((r) => /\/api\/applications\/[^/]+$/.test(r.url()) && r.request().method() === "PUT");
  await page.getByRole("combobox").selectOption("interview_1");
  await saved2;
  await page.reload();
  await expect(page.getByRole("combobox").locator("option:checked")).toHaveText("Interview 1");
  const saved3 = page.waitForResponse((r) => /\/api\/applications\/[^/]+$/.test(r.url()) && r.request().method() === "PUT");
  await page.getByRole("combobox").selectOption("applied");
  await saved3;
  await expect(page.getByRole("combobox").locator("option:checked")).toHaveText("Applied");

  await page.goto("/analytics");
  await expect(kpi(page, "Applied")).toContainText("1");
  await expect(kpi(page, "Applied")).toContainText("1 analysed only");
  const pipeline = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "Pipeline" }) });
  await expect(pipeline).toContainText("1Analysed");
  await expect(pipeline).toContainText("1Applied");
});

test("viewer sees only their own (empty) history", async ({ browser }) => {
  const ctx = await browser.newContext(asRole("viewer"));
  const page = await ctx.newPage();
  await page.goto("/history");
  await expect(page.getByText("No applications yet.")).toBeVisible();
  await ctx.close();
});
