import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The app's forms use <label> elements that are not associated with their
 * inputs (no htmlFor/id and not wrapping), so getByLabel() cannot see them.
 * This finds the input/textarea/select that sits in the same wrapper <div> as
 * the label with the given text.
 */
export function fieldByLabel(scope: Page | Locator, label: string | RegExp): Locator {
  // `has:` locators are resolved relative to each candidate, so build the
  // label locator from the page root rather than from `scope`.
  const root: Page = "page" in scope && typeof scope.page === "function" ? scope.page() : (scope as Page);
  const labelLocator = root.locator("label", {
    hasText: typeof label === "string" ? new RegExp(`^\\s*${escapeRegex(label)}\\s*\\*?\\s*$`) : label,
  });
  return scope
    .locator("div")
    .filter({ has: labelLocator })
    .last()
    .locator("input, textarea, select")
    .first();
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function loginWithPin(page: Page, email: string, pin: string, callbackUrl?: string) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  await page.getByRole("textbox", { name: "your@email.com" }).fill(email);
  await page.getByPlaceholder("------").fill(pin);
  await page.getByRole("button", { name: "Sign In" }).click();
}

/** Collects browser console errors and uncaught page errors. */
export function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Next.js dev-mode HMR socket noise is not an app error.
    if (/webpack-hmr|turbopack-hmr|_next\/webpack|\[HMR\]/i.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return {
    errors,
    expectNone: () => expect(errors, errors.join("\n")).toEqual([]),
  };
}

/** A job description that the analyser parses into a predictable title/company. */
export function jobDescription(title: string, company: string, extra = "") {
  return [
    `Role: ${title}`,
    `Company: ${company}`,
    "Location: Auckland CBD, hybrid",
    "",
    "We are looking for an experienced leader to drive AI adoption, cloud migration (Azure),",
    "cyber security governance and digital transformation. You will lead teams, manage vendors",
    "and stakeholders, and own a multi-million dollar budget. Remote working is available",
    "and we contribute to KiwiSaver.",
    extra,
  ].join("\n");
}
