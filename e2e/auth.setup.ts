import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import { AUTH_DIR, USERS, storageStatePath } from "./support/constants";
import { loginWithPin } from "./support/helpers";

// Logs each seeded role in through the real PIN login form and stores the
// resulting NextAuth session cookie so specs can start already signed in.
for (const role of ["admin", "user", "viewer"] as const) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const u = USERS[role];
    await loginWithPin(page, u.email, u.pin);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(`${u.name} (${u.role})`)).toBeVisible();
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
