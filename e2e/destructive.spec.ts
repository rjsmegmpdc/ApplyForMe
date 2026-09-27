import { test, expect, asRole, USERS } from "./support/fixtures";
import { fieldByLabel, loginWithPin } from "./support/helpers";

// Runs in its own Playwright project after the whole main suite, because it
// really deletes every row in the e2e database.

test.use(asRole("admin"));

test("Delete Everything wipes all data, signs out, and the next registrant becomes ADMIN", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete Everything" }).click();
  await page.getByPlaceholder("Type DELETE").fill("DELETE");
  await page.getByRole("button", { name: "Confirm Delete Everything" }).click();

  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();

  // Old credentials no longer work.
  await loginWithPin(page, USERS.admin.email, USERS.admin.pin);
  await expect(page.locator(".bg-red-50")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // First account on an empty system is made ADMIN.
  await page.goto("/register");
  await fieldByLabel(page, "Full Name").fill("Fresh Start");
  await fieldByLabel(page, "Email").fill("fresh@e2e.test");
  await fieldByLabel(page, "6-Digit PIN").fill("246810");
  await fieldByLabel(page, "Confirm PIN").fill("246810");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Fresh Start (ADMIN)")).toBeVisible();

  await page.goto("/profiles");
  await expect(page.locator("h3")).toHaveText(["Fresh Start"]);
});
