import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { storageStatePath, USERS } from "./constants";
import { jobDescription } from "./helpers";

type Role = "admin" | "user" | "viewer";

export const asRole = (role: Role) => ({ storageState: storageStatePath(role) });

/** Looks up a seeded user's id through the app's own API. */
export async function profileIdFor(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.get("/api/profiles");
  expect(res.ok()).toBeTruthy();
  const profiles: { id: string; name: string }[] = await res.json();
  const p = profiles.find((x) => x.name === name);
  if (!p) throw new Error(`profile ${name} not found in ${JSON.stringify(profiles)}`);
  return p.id;
}

/** Creates an application by running a real analysis through the API. */
export async function createApplication(
  request: APIRequestContext,
  profileId: string,
  title: string,
  company: string
): Promise<{ applicationId: string; matchPercentage: number }> {
  const res = await request.post("/api/analyze", {
    data: { profileId, jobText: jobDescription(title, company), hiringManager: "" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

/**
 * `test` with one tweak: the Next.js dev-mode indicator (<nextjs-portal>) sits
 * over the bottom of the sidebar and swallows clicks on "Sign Out". Make it
 * click-through; it stays visible so dev error overlays still show up in
 * failure screenshots (and console errors are asserted separately).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { pointer-events: none !important; }";
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
    });
    await use(page);
  },
});

export { expect, USERS };
