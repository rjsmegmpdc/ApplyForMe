import type { Flashcard } from "./flashcard-generator";

/**
 * Export flashcards as a tab-separated file for Anki import.
 * Format: Front\tBack\tTags
 * Anki import settings: Tab separator, allow HTML in fields, field 3 = tags
 */
export function exportToCSV(cards: Flashcard[]): Buffer {
  const header = "#separator:tab\n#html:true\n#tags column:3\n";
  const rows = cards.map((card) => {
    const front = escapeField(card.front);
    const back = escapeField(card.back);
    const tags = card.tags.join(" ");
    return `${front}\t${back}\t${tags}`;
  });

  const content = header + rows.join("\n");
  return Buffer.from(content, "utf-8");
}

function escapeField(text: string): string {
  // Replace tabs and newlines within fields
  return text.replace(/\t/g, "    ").replace(/\n/g, "<br>");
}
