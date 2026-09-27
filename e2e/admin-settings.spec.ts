import { test, expect, asRole, USERS } from "./support/fixtures";
import type { Page } from "@playwright/test";

// Admin user management (role select) and the Settings page (account info,
// theme buttons, Delete Everything confirmation gate). The actual wipe is in
// destructive.spec.ts, which runs after everything else.

function userRow(page: Page, name: string) {
  return page.getByRole("row", { name: new RegExp(`^${name}\\b`) });
}

test.describe("admin: user management", () => {
  test.use(asRole("admin"));

  test("table lists every user with email and role", async ({ page }) => {
    await page.goto("/admin");
    for (const u of [USERS.admin, USERS.user, USERS.viewer]) {
      const row = userRow(page, u.name);
      await expect(row).toContainText(u.email);
      await expect(row.getByRole("combobox")).toHaveValue(u.role);
    }
    await expect(page.getByRole("heading", { name: "Role Permissions" })).toBeVisible();
  });

  test("changing a role updates the select, its colour, and persists", async ({ page }) => {
    await page.goto("/admin");
    const select = userRow(page, USERS.recover.name).getByRole("combobox");
    await expect(select).toHaveValue("USER");
    await expect(select).toHaveClass(/bg-blue-100/);

    const saved = page.waitForResponse((r) => r.url().includes("/api/admin/users/") && r.request().method() === "PUT");
    await select.selectOption("VIEWER");
    expect((await saved).ok()).toBeTruthy();
    await expect(select).toHaveValue("VIEWER");
    await expect(select).toHaveClass(/bg-slate-100/);

    await page.reload();
    await expect(userRow(page, USERS.recover.name).getByRole("combobox")).toHaveValue("VIEWER");

    await userRow(page, USERS.recover.name).getByRole("combobox").selectOption("USER");
    await expect(userRow(page, USERS.recover.name).getByRole("combobox")).toHaveValue("USER");
    await page.waitForLoadState("networkidle");
  });

  test("demoting the last admin is refused with an alert and the select stays ADMIN", async ({ page }) => {
    await page.goto("/admin");
    const select = userRow(page, USERS.admin.name).getByRole("combobox");
    const dialog = page.waitForEvent("dialog");
    await select.selectOption("USER");
    const d = await dialog;
    expect(d.message()).toBe("Cannot remove the last admin");
    await d.accept();
    await expect(select).toHaveValue("ADMIN");
    await page.reload();
    await expect(userRow(page, USERS.admin.name).getByRole("combobox")).toHaveValue("ADMIN");
  });
});

test.describe("admin page as non-admin", () => {
  test.use(asRole("user"));
  test("shows 'Admin access required.' and no user table", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("Admin access required.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test.describe("settings (admin)", () => {
  test.use(asRole("admin"));

  test("account card shows the signed-in user", async ({ page }) => {
    await page.goto("/settings");
    const account = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "Account" }) });
    await expect(account).toContainText(`Name: ${USERS.admin.name}`);
    await expect(account).toContainText(`Email: ${USERS.admin.email}`);
    await expect(account).toContainText("Role: ADMIN");
  });

  test("Light/Dark buttons switch theme, highlight the active one, and sync the sidebar", async ({ page }) => {
    await page.goto("/settings");
    const html = page.locator("html");
    const light = page.getByRole("button", { name: "Light", exact: true });
    const dark = page.getByRole("button", { name: "Dark", exact: true });
    await expect(light).toHaveClass(/shadow-sm/);
    await expect(dark).not.toHaveClass(/shadow-sm/);

    await dark.click();
    await expect(html).toHaveClass(/dark/);
    await expect(dark).toHaveClass(/shadow-sm/);
    await expect(light).not.toHaveClass(/shadow-sm/);
    await expect(page.getByRole("button", { name: "Light Mode" })).toBeVisible(); // sidebar toggle label follows

    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("Delete Everything needs the exact word DELETE, and Cancel resets", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete Everything" }).click();
    await expect(page.getByText("Type DELETE to confirm permanent deletion of all data:")).toBeVisible();
    const confirm = page.getByRole("button", { name: "Confirm Delete Everything" });
    const input = page.getByPlaceholder("Type DELETE");
    await expect(confirm).toBeDisabled();
    await input.fill("delete");
    await expect(confirm).toBeDisabled();
    await input.fill("DELETE ");
    await expect(confirm).toBeDisabled();
    await input.fill("DELETE");
    await expect(confirm).toBeEnabled();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByPlaceholder("Type DELETE")).toHaveCount(0);
    await page.getByRole("button", { name: "Delete Everything" }).click();
    await expect(page.getByPlaceholder("Type DELETE")).toHaveValue("");
  });
});

test.describe("settings (non-admin)", () => {
  test.use(asRole("user"));
  test("no Danger Zone for regular users", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Role: USER")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Danger Zone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete Everything" })).toHaveCount(0);
  });
});
