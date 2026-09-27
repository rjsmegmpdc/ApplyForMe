import { test, expect, asRole, USERS } from "./support/fixtures";
import { loginWithPin } from "./support/helpers";

// Sidebar navigation, active-state highlighting, theme toggle and sign-out.

const sidebarTargets: [string, RegExp, string][] = [
  ["Analyse", /\/$/, "Job Analysis"],
  ["Profiles", /\/profiles$/, "Profiles"],
  ["Batch", /\/batch$/, "Batch Analysis"],
  ["Recruiters", /\/recruiters$/, "Recruiter Contacts"],
  ["Analytics", /\/analytics$/, "Analytics"],
  ["Questions", /\/questions$/, "Interview Questions"],
  ["History", /\/history$/, "Application History"],
  ["Settings", /\/settings$/, "Settings"],
  ["Admin", /\/admin$/, "User Management"],
];

test.describe("sidebar (admin)", () => {
  test.use(asRole("admin"));

  test("every sidebar link navigates to its page and becomes active", async ({ page }) => {
    await page.goto("/settings");
    const nav = page.getByRole("navigation");
    for (const [label, url, heading] of sidebarTargets) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await link.click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(link).toHaveClass(/bg-blue-600/);
      // Only one item is highlighted at a time.
      await expect(nav.locator("a.bg-blue-600")).toHaveCount(1);
    }
  });

  test("Home link goes to the public welcome page with a Start Analysing CTA", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByRole("link", { name: "Start Analysing" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Job Analysis" })).toBeVisible();
  });

  test("theme toggle switches dark mode, updates its label and persists", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    const toggle = page.getByRole("button", { name: "Dark Mode" });
    await toggle.click();
    await expect(html).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Light Mode" })).toBeVisible();

    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Light Mode" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Dark Mode" })).toBeVisible();
  });

  test("sidebar shows the signed-in user's name", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").getByText("E2E Admin")).toBeAttached();
  });
});

test.describe("sidebar (regular user)", () => {
  test.use(asRole("user"));

  test("Admin link is hidden for non-admins", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });
});

test.describe("sign out", () => {
  // Sign in fresh so signing out does not invalidate a shared storage state.
  test("Sign Out ends the session and protected pages redirect to login", async ({ page }) => {
    await loginWithPin(page, USERS.user.email, USERS.user.pin);
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/history");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fhistory/);
  });
});
