/**
 * Content moderation for custom questions.
 *
 * Checks:
 * 1. Profanity filter — block offensive language
 * 2. Tone check — flag aggressive, passive-aggressive, or unprofessional tone
 * 3. Length check — too short or too long
 * 4. Suggests corrections when issues found
 */

export interface ModerationResult {
  approved: boolean;
  issues: ModerationIssue[];
  suggestion?: string;
}

export interface ModerationIssue {
  type: "profanity" | "tone" | "length" | "quality";
  severity: "block" | "warn";
  detail: string;
}

// Profanity list — common offensive terms. Kept minimal and professional.
const PROFANITY_PATTERNS = [
  /\b(fuck|shit|damn|ass|bitch|crap|dick|piss|cunt|bastard|bloody|bollocks|bugger|wanker|twat)\w*\b/gi,
  /\b(wtf|stfu|lmao|lmfao)\b/gi,
];

// Aggressive/unprofessional tone markers
const TONE_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /\b(you\s+(?:better|must|should\s+have|need\s+to|have\s+to))\b/gi, detail: "Sounds demanding — rephrase as a question" },
  { pattern: /\b(obviously|clearly|everyone\s+knows)\b/gi, detail: "Condescending tone — remove qualifier" },
  { pattern: /\b(stupid|dumb|idiot|incompetent|useless|pathetic|terrible|awful)\b/gi, detail: "Negative language — reframe constructively" },
  { pattern: /\b(don['']?t\s+you\s+think|isn['']?t\s+it\s+obvious)\b/gi, detail: "Passive-aggressive phrasing — ask directly" },
  { pattern: /\b(honestly|to\s+be\s+(?:frank|honest|blunt))\b/gi, detail: "These hedges can signal upcoming criticism — rephrase positively" },
  { pattern: /[!]{2,}/g, detail: "Multiple exclamation marks — reduce emphasis" },
  { pattern: /[?]{2,}/g, detail: "Multiple question marks — one is enough" },
  { pattern: /\bwhy\s+(?:don['']?t|can['']?t|won['']?t)\s+you\b/gi, detail: "Accusatory phrasing — reframe as curiosity" },
];

// Quality checks
const MIN_LENGTH = 15;
const MAX_LENGTH = 500;
const MIN_WORDS = 4;

export function moderateContent(text: string): ModerationResult {
  const issues: ModerationIssue[] = [];
  let suggestion = text;

  // 1. Profanity check
  for (const pattern of PROFANITY_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      issues.push({
        type: "profanity",
        severity: "block",
        detail: `Contains inappropriate language: "${matches[0]}"`,
      });
      // Suggest replacement
      suggestion = suggestion.replace(pattern, "[removed]");
    }
  }

  // 2. Tone check
  for (const { pattern, detail } of TONE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      issues.push({
        type: "tone",
        severity: "warn",
        detail,
      });
    }
  }

  // 3. Length check
  if (text.length < MIN_LENGTH) {
    issues.push({
      type: "length",
      severity: "warn",
      detail: `Too short (${text.length} chars) — questions should be at least ${MIN_LENGTH} characters`,
    });
  }
  if (text.length > MAX_LENGTH) {
    issues.push({
      type: "length",
      severity: "warn",
      detail: `Too long (${text.length} chars) — keep under ${MAX_LENGTH} characters for clarity`,
    });
  }

  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < MIN_WORDS) {
    issues.push({
      type: "quality",
      severity: "warn",
      detail: `Only ${wordCount} words — add more context to make the question effective`,
    });
  }

  // 4. Quality check — should be a question
  if (!text.includes("?") && !text.toLowerCase().startsWith("tell me") && !text.toLowerCase().startsWith("describe")) {
    issues.push({
      type: "quality",
      severity: "warn",
      detail: "Doesn't appear to be a question — consider ending with a question mark",
    });
  }

  // 5. All caps check
  const upperRatio = (text.match(/[A-Z]/g)?.length || 0) / Math.max(text.length, 1);
  if (upperRatio > 0.5 && text.length > 10) {
    issues.push({
      type: "tone",
      severity: "warn",
      detail: "Excessive capitalisation reads as shouting — use normal case",
    });
    suggestion = suggestion.charAt(0).toUpperCase() + suggestion.slice(1).toLowerCase();
  }

  const hasBlockers = issues.some((i) => i.severity === "block");

  return {
    approved: !hasBlockers,
    issues,
    suggestion: suggestion !== text ? suggestion : undefined,
  };
}

/**
 * Auto-correct common issues and return a cleaned version.
 * Only fixes non-blocking issues — profanity must be manually addressed.
 */
export function suggestImprovement(text: string): string {
  let improved = text;

  // Fix multiple punctuation
  improved = improved.replace(/[!]{2,}/g, "!");
  improved = improved.replace(/[?]{2,}/g, "?");

  // Fix all caps
  const upperRatio = (improved.match(/[A-Z]/g)?.length || 0) / Math.max(improved.length, 1);
  if (upperRatio > 0.5 && improved.length > 10) {
    improved = improved.charAt(0).toUpperCase() + improved.slice(1).toLowerCase();
  }

  // Ensure ends with ?
  improved = improved.trim();
  if (!improved.endsWith("?") && !improved.endsWith(".")) {
    improved += "?";
  }

  // Trim whitespace
  improved = improved.replace(/\s+/g, " ").trim();

  return improved;
}
