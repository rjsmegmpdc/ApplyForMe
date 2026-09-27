import { test, expect, asRole, profileIdFor, createApplication, USERS } from "./support/fixtures";
import { trackConsoleErrors } from "./support/helpers";

// Every route renders its main heading without browser console errors or
// uncaught exceptions.

test.describe("public pages (signed out)", () => {
  const pages: [string, RegExp | string][] = [
    ["/login", "ApplyForMe"],
    ["/register", "Create Account"],
    ["/welcome", "ApplyForMe"],
  ];
  for (const [path, heading] of pages) {
    test(`${path} loads cleanly`, async ({ page }) => {
      const consoleErrors = trackConsoleErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState("networkidle");
      consoleErrors.expectNone();
    });
  }

  test("protected routes redirect to /login with a callbackUrl", async ({ page }) => {
    for (const path of ["/", "/profiles", "/questions", "/settings", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=${encodeURIComponent(path)}$`));
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    }
  });
});

test.describe("authenticated pages (admin)", () => {
  test.use(asRole("admin"));

  let adminId = "";
  let appId = "";
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext(asRole("admin"));
    adminId = await profileIdFor(ctx.request, USERS.admin.name);
    appId = (await createApplication(ctx.request, adminId, "Head of Pages", "Smoke Test Ltd")).applicationId;
    await ctx.close();
  });

  const pages: [string, string][] = [
    ["/", "Job Analysis"],
    ["/profiles", "Profiles"],
    ["/profiles/new", "New Profile"],
    ["/batch", "Batch Analysis"],
    ["/recruiters", "Recruiter Contacts"],
    ["/analytics", "Analytics"],
    ["/questions", "Interview Questions"],
    ["/history", "Application History"],
    ["/settings", "Settings"],
    ["/admin", "User Management"],
  ];
  for (const [path, heading] of pages) {
    test(`${path} loads cleanly`, async ({ page }) => {
      const consoleErrors = trackConsoleErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      consoleErrors.expectNone();
    });
  }

  test("/profiles/[id] loads cleanly", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto(`/profiles/${adminId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Edit Profile" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    consoleErrors.expectNone();
  });

  test("/profiles/[id]/import loads cleanly", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto(`/profiles/${adminId}/import`);
    await expect(page.getByRole("heading", { level: 1, name: "Import Profile Data" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    consoleErrors.expectNone();
  });

  test("/history/[id] loads cleanly", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto(`/history/${appId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Head of Pages" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    consoleErrors.expectNone();
  });
});
