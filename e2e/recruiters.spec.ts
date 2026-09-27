import { test, expect, asRole } from "./support/fixtures";
import type { Page } from "@playwright/test";

// Recruiter contacts: add form, overdue follow-up banner, "Contacted", delete.

test.use(asRole("user"));

function contactCard(page: Page, name: string) {
  return page.locator("div.rounded-xl", { has: page.getByRole("heading", { name, exact: true }) });
}

/** Format a date the same way the page does, in the browser's own timezone. */
function nzDate(page: Page, iso: string) {
  return page.evaluate((d) => new Date(d).toLocaleDateString("en-NZ"), iso);
}

test("+ Add Contact toggles the form; Save requires a name", async ({ page }) => {
  await page.goto("/recruiters");
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await expect(page.getByRole("heading", { name: "New Contact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Add Contact" })).toHaveCount(0);

  const save = page.getByRole("button", { name: "Save Contact" });
  await expect(save).toBeDisabled();
  await page.getByPlaceholder("Name *").fill("  ");
  await expect(save).toBeDisabled();
  await page.getByPlaceholder("Name *").fill("Someone");
  await expect(save).toBeEnabled();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "New Contact" })).toHaveCount(0);
});

test("adding a contact shows all entered details and a future follow-up is not overdue", async ({ page }) => {
  await page.goto("/recruiters");
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await page.getByPlaceholder("Name *").fill("Rachel Recruiter");
  await page.getByPlaceholder("Email").fill("rachel@agency.example");
  await page.getByPlaceholder("Phone").fill("09 123 4567");
  await page.getByPlaceholder("Company / Client").fill("BigBank");
  await page.getByPlaceholder("Agency (if applicable)").fill("TalentCo");
  await page.locator('input[type="date"]').fill("2099-01-15");
  await page.getByPlaceholder("Notes...").fill("Prefers email; knows the CTO.");
  await page.getByRole("button", { name: "Save Contact" }).click();

  await expect(page.getByRole("heading", { name: "New Contact" })).toHaveCount(0);
  const card = contactCard(page, "Rachel Recruiter");
  await expect(card).toContainText("TalentCo · BigBank · rachel@agency.example · 09 123 4567");
  await expect(card).toContainText("Prefers email; knows the CTO.");
  await expect(card).toContainText(`Follow up: ${await nzDate(page, "2099-01-15")}`);
  await expect(page.getByText(/overdue/)).toHaveCount(0);

  await page.reload();
  await expect(contactCard(page, "Rachel Recruiter")).toContainText("TalentCo · BigBank");
});

test("a past follow-up date raises the overdue banner", async ({ page }) => {
  await page.goto("/recruiters");
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await page.getByPlaceholder("Name *").fill("Oscar Overdue");
  await page.locator('input[type="date"]').fill("2020-02-01");
  await page.getByRole("button", { name: "Save Contact" }).click();

  await expect(page.getByText(/follow-ups? overdue:.*Oscar Overdue/)).toBeVisible();
  await expect(contactCard(page, "Oscar Overdue")).toContainText("No company");
  await expect(contactCard(page, "Oscar Overdue").getByText(/^Follow up:/)).toHaveClass(/text-amber-600/);
});

test("Contacted stamps today's date as last contact", async ({ page }) => {
  await page.goto("/recruiters");
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await page.getByPlaceholder("Name *").fill("Carl Contacted");
  await page.getByRole("button", { name: "Save Contact" }).click();
  const card = contactCard(page, "Carl Contacted");
  await expect(card).not.toContainText("Last contact:");

  await card.getByRole("button", { name: "Contacted" }).click();
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-NZ"));
  await expect(card).toContainText(`Last contact: ${today}`);
  await page.reload();
  await expect(contactCard(page, "Carl Contacted")).toContainText(`Last contact: ${today}`);
});

test("delete asks for confirmation and removes the contact", async ({ page }) => {
  await page.goto("/recruiters");
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await page.getByPlaceholder("Name *").fill("Dan Delete");
  await page.getByRole("button", { name: "Save Contact" }).click();
  const card = contactCard(page, "Dan Delete");

  page.once("dialog", (d) => {
    expect(d.message()).toBe("Delete this contact?");
    return d.dismiss();
  });
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(contactCard(page, "Dan Delete")).toHaveCount(0);
});

// BUG: "Contacted" sends PUT /api/recruiters/[id] { lastContacted } only, and
// that route writes `email: body.email || null`, `company: body.company || null`,
// `notes: ...`, `followUpDate: ...` etc. unconditionally -- so marking a
// contact as contacted silently wipes their email, phone, company, agency,
// notes and follow-up date.
test.fail("Contacted keeps the contact's other details", async ({ page }) => {
  await page.goto("/recruiters");
  await page.getByRole("button", { name: "+ Add Contact" }).click();
  await page.getByPlaceholder("Name *").fill("Keeper Kim");
  await page.getByPlaceholder("Email").fill("kim@agency.example");
  await page.getByPlaceholder("Company / Client").fill("KeepCo");
  await page.getByPlaceholder("Notes...").fill("Important notes");
  await page.getByRole("button", { name: "Save Contact" }).click();
  const card = contactCard(page, "Keeper Kim");
  await expect(card).toContainText("KeepCo · kim@agency.example");

  await card.getByRole("button", { name: "Contacted" }).click();
  await expect(card).toContainText("Last contact:");
  await expect(card).toContainText("KeepCo · kim@agency.example", { timeout: 3_000 });
  await expect(card).toContainText("Important notes", { timeout: 1_000 });
});
