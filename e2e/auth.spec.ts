import { test, expect, USERS } from "./support/fixtures";
import { fieldByLabel, loginWithPin } from "./support/helpers";
import { db } from "./support/db";

// Signed-out flows: login tabs, PIN validation/lockout, recovery, registration
// and the welcome page CTAs.

test.describe("login page", () => {
  test("tabs switch between PIN, passkey and recovery forms", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    await page.getByRole("button", { name: "Passkey", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in with Passkey" })).toBeVisible();
    await expect(page.getByText("Use your device's biometric sensor")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Forgot PIN" }).click();
    await expect(page.getByRole("button", { name: "Send Recovery Link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Passkey" })).toHaveCount(0);

    await page.getByRole("button", { name: "PIN Login" }).click();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  });

  test("PIN field only accepts digits and Sign In enables at 6 digits", async ({ page }) => {
    await page.goto("/login");
    const pin = page.getByPlaceholder("------");
    const submit = page.getByRole("button", { name: "Sign In", exact: true });
    await page.getByRole("textbox", { name: "your@email.com" }).fill(USERS.admin.email);

    await pin.pressSequentially("12ab3");
    await expect(pin).toHaveValue("123");
    await expect(submit).toBeDisabled();

    await pin.pressSequentially("456789"); // maxLength=6
    await expect(pin).toHaveValue("123456");
    await expect(submit).toBeEnabled();
  });

  test("valid PIN signs in and honours callbackUrl", async ({ page }) => {
    await loginWithPin(page, USERS.user.email, USERS.user.pin, "/recruiters");
    await expect(page).toHaveURL(/\/recruiters$/);
    await expect(page.getByRole("heading", { name: "Recruiter Contacts" })).toBeVisible();
  });

  test("unknown email shows an error and stays on /login", async ({ page }) => {
    await loginWithPin(page, "nobody@e2e.test", "123456");
    await expect(page.locator(".bg-red-50")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  // BUG: authorize() throws descriptive errors ("Invalid PIN. 4 attempts
  // remaining.", "Account locked after 5 failed attempts.") but NextAuth v5
  // replaces any error thrown from a Credentials provider's authorize() with
  // a generic code, so the login page just shows "Configuration" -- the user
  // never learns the PIN was wrong, how many attempts remain, or that the
  // account is now locked.
  test.fail("wrong PIN reports remaining attempts", async ({ page }) => {
    await loginWithPin(page, USERS.lockout.email, "000000");
    await expect(page.getByText("Invalid PIN. 4 attempts remaining.")).toBeVisible({ timeout: 5_000 });
  });

  test("five wrong PINs lock the account (correct PIN then rejected)", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await loginWithPin(page, USERS.lockout.email, "000000");
      await expect(page.locator(".bg-red-50")).toBeVisible();
    }
    const user = await db().user.findFirst({ where: { email: USERS.lockout.email } });
    expect(user?.failedPinAttempts).toBe(5);
    expect(user?.lockedUntil).not.toBeNull();

    await loginWithPin(page, USERS.lockout.email, USERS.lockout.pin);
    await expect(page.locator(".bg-red-50")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("register link goes to /register", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  });
});

test.describe("PIN recovery", () => {
  test("requesting a recovery link shows the neutral confirmation", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot PIN" }).click();
    await page.getByRole("textbox", { name: "your@email.com" }).fill(USERS.recover.email);
    await page.getByRole("button", { name: "Send Recovery Link" }).click();
    await expect(page.getByText("If the email exists, a recovery link has been sent.")).toBeVisible();

    const token = await db().verificationToken.findFirst({ where: { identifier: USERS.recover.email } });
    expect(token?.token).toMatch(/^[0-9a-f]{64}$/);
  });

  test("recovery link opens the Reset PIN tab", async ({ page }) => {
    await page.goto("/login?recover=abc");
    await expect(page.getByRole("button", { name: "Reset PIN" }).first()).toBeVisible();
    await expect(page.getByText("New 6-Digit PIN")).toBeVisible();
  });

  test("invalid recovery token is rejected", async ({ page }) => {
    await page.goto("/login?recover=not-a-real-token");
    await page.getByPlaceholder("------").fill("777777");
    await page.locator("form").getByRole("button", { name: "Reset PIN" }).click();
    await expect(page.getByText("Invalid or expired token")).toBeVisible();
  });

  // BUG: /api/auth/recover calls prisma.user.findUnique({ where: { email } })
  // but User.email is not @unique in prisma/schema.prisma, so Prisma throws
  // and every valid reset returns 500 "Recovery failed". (tsc also flags this.)
  test.fail("valid recovery token resets the PIN", async ({ page, request }) => {
    await request.post("/api/auth/recover", { data: { email: USERS.recover.email } });
    const token = await db().verificationToken.findFirst({
      where: { identifier: USERS.recover.email },
      orderBy: { expires: "desc" },
    });
    await page.goto(`/login?recover=${token!.token}`);
    await page.getByPlaceholder("------").fill("777777");
    await page.locator("form").getByRole("button", { name: "Reset PIN" }).click();
    await expect(page.getByText("PIN reset successfully! You can now log in.")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("registration", () => {
  test("mismatched PINs show inline error and keep submit disabled", async ({ page }) => {
    await page.goto("/register");
    await fieldByLabel(page, "Full Name").fill("Mismatch Person");
    await fieldByLabel(page, "Email").fill("mismatch@e2e.test");
    await fieldByLabel(page, "6-Digit PIN").fill("123456");
    await fieldByLabel(page, "Confirm PIN").fill("654321");
    await expect(page.getByText("PINs do not match")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeDisabled();

    await fieldByLabel(page, "Confirm PIN").fill("123456");
    await expect(page.getByText("PINs do not match")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Account" })).toBeEnabled();
  });

  test("duplicate email is rejected with a helpful message", async ({ page }) => {
    await page.goto("/register");
    await fieldByLabel(page, "Full Name").fill("Dupe");
    await fieldByLabel(page, "Email").fill(USERS.viewer.email);
    await fieldByLabel(page, "6-Digit PIN").fill("123456");
    await fieldByLabel(page, "Confirm PIN").fill("123456");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("An account with this email already exists.")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("new account is created, auto-signed-in as USER and lands on /", async ({ page }) => {
    await page.goto("/register");
    await fieldByLabel(page, "Full Name").fill("Reg Istered");
    await fieldByLabel(page, "Email").fill("registered@e2e.test");
    await fieldByLabel(page, "6-Digit PIN").fill("135790");
    await fieldByLabel(page, "Confirm PIN").fill("135790");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Reg Istered (USER)")).toBeVisible();
  });

  test("sign in link goes back to /login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("welcome page", () => {
  test("signed out: Sign In and Create Account CTAs navigate", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("link", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/welcome");
    await page.getByRole("link", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });
});
