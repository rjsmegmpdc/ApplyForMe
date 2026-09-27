import { test, expect, asRole } from "./support/fixtures";
import { fieldByLabel } from "./support/helpers";
import type { Browser, Page } from "@playwright/test";

// /questions: per-question preferences (favourite, rating, exclude, notes),
// custom questions with desired outcomes + content moderation, and admin
// curation (approve / reject) of other users' submissions.

const FIRST_Q_CATEGORY = "Pre-Close & Success Framing";

/** The card for the first library question, located by position. */
function firstCard(page: Page) {
  const category = page.locator("div.mb-8", { has: page.getByRole("heading", { name: FIRST_Q_CATEGORY }) });
  return category.locator("div.rounded-xl").first();
}

function stat(page: Page, label: "Favourites" | "Excluded") {
  return page.locator("div.rounded-lg", { has: page.getByText(label, { exact: true }) }).locator("span.font-bold");
}

/**
 * Preference clicks update the UI optimistically and POST in the background;
 * wait for the POST before reloading so persistence is really being tested.
 */
async function savingPref(page: Page, action: () => Promise<void>) {
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/question-prefs") && r.request().method() === "POST");
  await action();
  expect((await saved).ok()).toBeTruthy();
}

function customCard(page: Page, question: string) {
  return page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: question, exact: true }) });
}

async function openQuestions(page: Page) {
  await page.goto("/questions");
  await expect(page.getByRole("heading", { name: "Interview Questions" })).toBeVisible();
}

async function submitCustom(
  page: Page,
  opts: { question: string; outcome?: string; category?: string; basedOn?: string }
) {
  await page.getByRole("button", { name: "+ New Question" }).click();
  await page.getByPlaceholder("What question would you ask the interviewer?").fill(opts.question);
  if (opts.outcome) await page.getByPlaceholder("What insight should this question surface?").fill(opts.outcome);
  if (opts.category) await fieldByLabel(page, "Category").selectOption({ label: opts.category });
  if (opts.basedOn) await fieldByLabel(page, /^Based on/).selectOption({ label: opts.basedOn });
  await page.getByRole("button", { name: "Submit for Review" }).click();
}

test.describe("library question preferences (user)", () => {
  test.use(asRole("user"));

  test("library shows all categories and totals", async ({ page }) => {
    await openQuestions(page);
    for (const cat of [FIRST_Q_CATEGORY, "Reveal the Real Role", "Reveal Culture & Leadership", "Signal Seniority", "Create Memorable Impression"]) {
      await expect(page.getByRole("heading", { name: cat })).toBeVisible();
    }
    const total = page.locator("div.rounded-lg", { has: page.getByText("Total", { exact: true }) }).locator("span.font-bold");
    const cards = await page.locator("div.mb-8 div.rounded-xl").count();
    await expect(total).toHaveText(String(cards));
  });

  test("favourite toggles the star, updates the counter and persists", async ({ page }) => {
    await openQuestions(page);
    const card = firstCard(page);
    await expect(stat(page, "Favourites")).toHaveText("0");

    await savingPref(page, () => card.getByTitle("Mark as favourite").click());
    await expect(card.getByTitle("Remove favourite")).toHaveText("★");
    await expect(stat(page, "Favourites")).toHaveText("1");
    await expect(card).toHaveClass(/border-yellow-300/);

    await page.reload();
    await expect(firstCard(page).getByTitle("Remove favourite")).toBeVisible();
    await expect(stat(page, "Favourites")).toHaveText("1");

    await savingPref(page, () => firstCard(page).getByTitle("Remove favourite").click());
    await expect(firstCard(page).getByTitle("Mark as favourite")).toHaveText("☆");
    await expect(stat(page, "Favourites")).toHaveText("0");
  });

  test("rating dots set N/5, clicking the same dot clears, and it persists", async ({ page }) => {
    await openQuestions(page);
    const card = firstCard(page);
    const dots = card.locator("div.flex.gap-0\\.5 > button");
    await expect(dots).toHaveCount(5);

    await savingPref(page, () => dots.nth(2).click());
    await expect(card.getByText("3/5")).toBeVisible();
    await expect(dots).toHaveText(["●", "●", "●", "○", "○"]);

    await savingPref(page, () => dots.nth(4).click());
    await expect(card.getByText("5/5")).toBeVisible();

    await page.reload();
    await expect(firstCard(page).getByText("5/5")).toBeVisible();

    await savingPref(page, () => firstCard(page).locator("div.flex.gap-0\\.5 > button").nth(4).click());
    await expect(firstCard(page).getByText(/\d\/5/)).toHaveCount(0);
    await expect(firstCard(page).locator("div.flex.gap-0\\.5 > button")).toHaveText(Array(5).fill("○"));
  });

  test("exclude toggles label, dims the card, updates counter and persists", async ({ page }) => {
    await openQuestions(page);
    const card = firstCard(page);
    await expect(stat(page, "Excluded")).toHaveText("0");

    await savingPref(page, () => card.getByRole("button", { name: "Exclude from deck" }).click());
    await expect(card.getByRole("button", { name: "Excluded – click to restore" })).toBeVisible();
    await expect(card).toHaveClass(/opacity-50/);
    await expect(stat(page, "Excluded")).toHaveText("1");

    await page.reload();
    await expect(stat(page, "Excluded")).toHaveText("1");
    await savingPref(page, () => firstCard(page).getByRole("button", { name: "Excluded – click to restore" }).click());
    await expect(firstCard(page).getByRole("button", { name: "Exclude from deck" })).toBeVisible();
    await expect(stat(page, "Excluded")).toHaveText("0");
  });

  test("personal notes: add with Enter, edit with Save, persist", async ({ page }) => {
    await openQuestions(page);
    const card = firstCard(page);
    await card.getByRole("button", { name: "+ Notes" }).click();
    const input = card.getByPlaceholder("Personal notes about this question...");
    await expect(input).toBeFocused();
    await input.fill("Ask this near the end");
    await savingPref(page, () => input.press("Enter"));
    await expect(input).toHaveCount(0);
    await expect(card.getByText("Ask this near the end")).toBeVisible();
    await expect(card.getByRole("button", { name: "Edit notes" })).toBeVisible();

    await card.getByRole("button", { name: "Edit notes" }).click();
    await expect(input).toHaveValue("Ask this near the end");
    await input.fill("Ask this second to last");
    await savingPref(page, () => card.getByRole("button", { name: "Save" }).click());
    await expect(card.getByText("Ask this second to last")).toBeVisible();

    await page.reload();
    await expect(firstCard(page).getByText("Ask this second to last")).toBeVisible();
  });
});

test.describe("custom questions (user)", () => {
  test.use(asRole("user"));

  test("+ New Question toggles the form and Submit requires text", async ({ page }) => {
    await openQuestions(page);
    await expect(page.getByText('No custom questions yet.')).toBeVisible();
    await page.getByRole("button", { name: "+ New Question" }).click();
    await expect(page.getByRole("button", { name: "Submit for Review" })).toBeDisabled();
    await page.getByPlaceholder("What question would you ask the interviewer?").fill("   ");
    await expect(page.getByRole("button", { name: "Submit for Review" })).toBeDisabled();
    await page.getByPlaceholder("What question would you ask the interviewer?").fill("What would you change first?");
    await expect(page.getByRole("button", { name: "Submit for Review" })).toBeEnabled();

    // Selects reflect the chosen option
    const category = fieldByLabel(page, "Category");
    await category.selectOption({ label: "Signal Seniority" });
    await expect(category.locator("option:checked")).toHaveText("Signal Seniority");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByPlaceholder("What question would you ask the interviewer?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ New Question" })).toBeVisible();
  });

  test("clean question is auto-approved, form resets, and it persists", async ({ page }) => {
    await openQuestions(page);
    const q = "What would make someone exceptional in this role after a year?";
    await submitCustom(page, { question: q, category: "Pre-Close & Success Framing" });
    const card = customCard(page, q);
    await expect(card).toContainText("approved");
    await expect(card).not.toContainText("Moderation:");
    // Form closes and resets
    await expect(page.getByPlaceholder("What question would you ask the interviewer?")).toHaveCount(0);
    await page.getByRole("button", { name: "+ New Question" }).click();
    await expect(page.getByPlaceholder("What question would you ask the interviewer?")).toHaveValue("");
    await expect(fieldByLabel(page, "Category").locator("option:checked")).toHaveText("Custom");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.reload();
    await expect(customCard(page, q)).toContainText("approved");
  });

  test("desired outcome is saved and displayed with the question", async ({ page }) => {
    await openQuestions(page);
    const q = "Which decision in the last year would you revisit?";
    await submitCustom(page, { question: q, outcome: "What does the team regret, and do they learn from it?" });
    const card = customCard(page, q);
    await expect(card).toContainText("Desired outcome: What does the team regret, and do they learn from it?");
    await page.reload();
    await expect(customCard(page, q)).toContainText("Desired outcome: What does the team regret");
  });

  // BUG: the desired outcome is run through the same moderation rules as the
  // question, including "Doesn't appear to be a question". A desired outcome
  // is naturally a statement ("Learn the real success criteria"), so every
  // clean question with a normal outcome is pushed to "needs review", and the
  // stored note is malformed ("Moderation: ; Doesn't appear to be a question").
  test.fail("statement-style desired outcome does not force manual review", async ({ page }) => {
    await openQuestions(page);
    const q = "What separates good from great in this team?";
    await submitCustom(page, { question: q, outcome: "Learn the real success criteria" });
    const card = customCard(page, q);
    await expect(card).toContainText("Desired outcome: Learn the real success criteria");
    await expect(card).toContainText("approved", { timeout: 5_000 });
  });

  test("question customised from the library is labelled as such", async ({ page }) => {
    await openQuestions(page);
    const basedOnSelect = async () => {
      await page.getByRole("button", { name: "+ New Question" }).click();
      return fieldByLabel(page, /^Based on/);
    };
    const select = await basedOnSelect();
    const firstLibraryOption = (await select.locator("option").nth(1).textContent())!;
    await page.getByRole("button", { name: "Cancel" }).click();

    const q = "Which team goals would this hire unblock in the first quarter?";
    await submitCustom(page, { question: q, basedOn: firstLibraryOption });
    await expect(customCard(page, q)).toContainText("customised from library");
  });

  test("tone warning puts the question into needs review with a moderation note", async ({ page }) => {
    await openQuestions(page);
    const q = "Honestly, what do people dislike most about working here?";
    await submitCustom(page, { question: q });
    const card = customCard(page, q);
    await expect(card).toContainText("needs review");
    await expect(card).toContainText("Moderation: These hedges can signal upcoming criticism");
  });

  test("profanity is blocked with a suggestion that can be applied", async ({ page }) => {
    await openQuestions(page);
    await submitCustom(page, { question: "What is the shittiest part of this job?" });
    await expect(page.getByText("Content issues found:")).toBeVisible();
    await expect(page.getByText("BLOCKED:")).toBeVisible();
    await expect(page.getByText('Contains inappropriate language: "shittiest"')).toBeVisible();
    await expect(customCard(page, "What is the shittiest part of this job?")).toHaveCount(0);

    await page.getByRole("button", { name: "Use suggestion" }).click();
    await expect(page.getByPlaceholder("What question would you ask the interviewer?")).toHaveValue(
      "What is the [removed] part of this job?"
    );
  });

  test("blocked desired outcome is rejected too", async ({ page }) => {
    await openQuestions(page);
    await submitCustom(page, { question: "What does the team celebrate?", outcome: "Find out if they are crap" });
    await expect(page.getByText('Contains inappropriate language: "crap"')).toBeVisible();
  });

  // BUG: the profanity filter is /\b(...|ass|...)\w*\b/ so any word that merely
  // *starts with* "ass" (assess, assist, assume, assignment...) -- or with
  // "crap", "dick", "piss", "bugger" -- is BLOCKED as inappropriate language.
  test.fail("ordinary words like 'assess' are not flagged as profanity", async ({ page }) => {
    await openQuestions(page);
    const q = "How will you assess success in this role after six months?";
    await submitCustom(page, { question: q });
    await expect(customCard(page, q)).toContainText("approved", { timeout: 5_000 });
  });

  test("regular users see no Approve/Reject controls and can delete their own question", async ({ page }) => {
    await openQuestions(page);
    const q = "How are priorities set when everything is urgent?";
    await submitCustom(page, { question: q });
    const card = customCard(page, q);
    await expect(card).toContainText("approved");
    await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Reject" })).toHaveCount(0);

    page.once("dialog", (d) => d.dismiss());
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(customCard(page, q)).toHaveCount(0);
  });
});

test.describe("admin curation", () => {
  async function userSubmits(browser: Browser, question: string, outcome?: string) {
    const ctx = await browser.newContext(asRole("user"));
    const res = await ctx.request.post("/api/custom-questions", {
      data: { question, desiredOutcome: outcome ?? null, category: "culture" },
    });
    expect(res.ok()).toBeTruthy();
    await ctx.close();
  }

  test.use(asRole("admin"));

  test("admin sees other users' submissions and can approve then reject", async ({ page, browser }) => {
    const q = "Honestly, how often do plans change mid-quarter?";
    await userSubmits(browser, q, "Gauge planning stability");

    await openQuestions(page);
    const card = customCard(page, q);
    await expect(card).toContainText("needs review");
    await expect(card).toContainText("by E2E User");
    await expect(card).toContainText("Desired outcome: Gauge planning stability");

    await card.getByRole("button", { name: "Approve" }).click();
    await expect(card).toContainText("approved");
    await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Reject" })).toBeVisible();

    await card.getByRole("button", { name: "Reject" }).click();
    await expect(card).toContainText("rejected");
    await expect(card).toHaveClass(/opacity-50/);
    await expect(card.getByRole("button", { name: "Reject" })).toHaveCount(0);

    await page.reload();
    await expect(customCard(page, q)).toContainText("rejected");
  });

  test("the submitting user sees the admin's decision", async ({ page, browser }) => {
    const q = "Honestly, what would you do differently next time?";
    await userSubmits(browser, q);
    await openQuestions(page);
    await customCard(page, q).getByRole("button", { name: "Approve" }).click();
    await expect(customCard(page, q)).toContainText("approved");

    const userCtx = await browser.newContext(asRole("user"));
    const userPage = await userCtx.newPage();
    await openQuestions(userPage);
    await expect(customCard(userPage, q)).toContainText("approved");
    await expect(customCard(userPage, q)).not.toContainText("by E2E User"); // author tag is admin-only
    await userCtx.close();
  });
});
