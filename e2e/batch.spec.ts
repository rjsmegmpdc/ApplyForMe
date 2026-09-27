import { test, expect, asRole } from "./support/fixtures";
import { fieldByLabel, jobDescription } from "./support/helpers";

// Batch analysis: the "job(s) detected" counter follows the textarea, the
// button is gated, and results are ranked with working View links.

test.use(asRole("admin"));

test("job counter tracks separators and the button is gated", async ({ page }) => {
  await page.goto("/batch");
  const text = page.getByPlaceholder(/Paste Job 1 here/);
  const counter = page.getByText(/job\(s\) detected/);
  const run = page.getByRole("button", { name: "Analyse All & Rank" });
  const profile = fieldByLabel(page, "Profile");

  await expect(profile.locator("option:checked")).toHaveText("E2E Admin");
  await expect(counter).toHaveText("0 job(s) detected");
  await expect(run).toBeDisabled();

  await text.fill("Too short to count");
  await expect(counter).toHaveText("0 job(s) detected");
  await expect(run).toBeEnabled(); // any text enables it

  const a = jobDescription("Head of Security", "Kea Insurance");
  const b = jobDescription("Chief Digital Officer", "Pohutukawa Power");
  await text.fill(`${a}\n---\n${b}`);
  await expect(counter).toHaveText("2 job(s) detected");
  await text.fill(`${a}\n===\n${b}\n---\n${jobDescription("Principal Architect", "Weka Works")}`);
  await expect(counter).toHaveText("3 job(s) detected");

  await profile.selectOption("");
  await expect(run).toBeDisabled();
});

test("Analyse All & Rank shows ranked results with View links", async ({ page }) => {
  await page.goto("/batch");
  await fieldByLabel(page, "Profile").selectOption({ label: "E2E Admin" });
  const strong = jobDescription("Head of AI Transformation", "Strong Match Ltd");
  const weak = [
    "Role: Pastry Chef",
    "Company: Bakery Corner",
    "We need someone to bake croissants and sourdough every morning in our busy bakery kitchen.",
  ].join("\n");
  await page.getByPlaceholder(/Paste Job 1 here/).fill(`${weak}\n---\n${strong}`);
  await page.getByRole("button", { name: "Analyse All & Rank" }).click();

  await expect(page.getByRole("heading", { name: "Ranked Results (2 jobs)" })).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  // Ranked by match: the leadership JD beats the pastry chef JD.
  await expect(rows.nth(0)).toContainText("Head of AI Transformation");
  await expect(rows.nth(0)).toContainText("Strong Match Ltd");
  await expect(rows.nth(0)).toContainText("Auckland");
  await expect(rows.nth(1)).toContainText("Pastry Chef");
  const pct = async (i: number) => Number((await rows.nth(i).locator("td").nth(4).innerText()).replace("%", ""));
  expect(await pct(0)).toBeGreaterThanOrEqual(await pct(1));
  await expect(rows.nth(0).locator("td").nth(1)).toHaveText("Head of AI Transformation");

  await rows.nth(0).getByRole("link", { name: "View" }).click();
  await expect(page).toHaveURL(/\/history\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Head of AI Transformation" })).toBeVisible();
});
