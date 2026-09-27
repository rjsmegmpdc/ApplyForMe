import { test, expect, asRole, USERS } from "./support/fixtures";

// What each role can see and do in the UI.

test.describe("viewer (read-only)", () => {
  test.use(asRole("viewer"));

  test("cannot run analyses: no Analyse button even with text entered", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(`${USERS.viewer.name} (VIEWER)`)).toBeVisible();
    await page.getByPlaceholder("Paste the full job description").fill("Role: Anything\nCompany: Anyone");
    await expect(page.getByRole("button", { name: "Analyse & Match" })).toHaveCount(0);
  });

  test("profiles page is read-only and shows only their own profile", async ({ page }) => {
    await page.goto("/profiles");
    await expect(page.getByRole("heading", { name: USERS.viewer.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: USERS.admin.name })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "+ Add Profile" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("settings shows VIEWER role", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Role: VIEWER")).toBeVisible();
  });
});

test.describe("regular user", () => {
  test.use(asRole("user"));

  test("sees and can edit only their own profile; cannot delete", async ({ page }) => {
    await page.goto("/profiles");
    await expect(page.getByRole("heading", { name: USERS.user.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: USERS.admin.name })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "+ Add Profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("analyse page only offers their own profile", async ({ page }) => {
    await page.goto("/");
    const select = page.locator("select").first();
    await expect(select.locator("option")).toHaveText(["Select a profile...", USERS.user.name]);
    await expect(select.locator("option:checked")).toHaveText(USERS.user.name);
  });
});
