/**
 * Minimal, dependency-free HTML → plain-text helpers shared by the Seek
 * email and job-page parsers. Consolidates the ad-hoc tag stripping that
 * was duplicated across v1's seek-email-parser.ts and fetchSeekJobPage.
 *
 * Pure: string in, string out. Not a full HTML parser — it is tuned for the
 * marketing-email / job-ad markup we actually see, where block elements
 * should become line breaks and inline elements should become spaces.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  pound: '£',
  euro: '€',
  times: '×',
};

/** Decode named and numeric (decimal / hex) HTML entities. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code, whole) : whole;
    }
    if (lower.startsWith('#')) {
      const code = parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code, whole) : whole;
    }
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Elements whose entire content is noise for text extraction. */
const DROP_ELEMENTS = ['script', 'style', 'noscript', 'template', 'head', 'svg', 'iframe'];

/**
 * Paragraph-level elements: both the opening and the closing tag become a
 * line break, so `<p>a</p><p>b</p>` reads as two paragraphs.
 */
const PARAGRAPH_ELEMENTS = [
  'p', 'div', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'section',
  'article', 'header', 'footer', 'aside', 'nav', 'blockquote', 'pre', 'dl',
  'center', 'main', 'figure', 'figcaption', 'address', 'br', 'hr',
];

/**
 * Item-level elements: only the opening tag breaks the line, so consecutive
 * `<li>`/`<td>` items sit on adjacent lines without a blank between them.
 */
const ITEM_ELEMENTS = ['li', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'dd', 'dt'];

/**
 * Remove `<script>`, `<style>`, comments and similar non-content elements.
 * Tolerant of unclosed tags (drops to end of input).
 */
export function stripNonContent(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DROP_ELEMENTS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    out = out.replace(re, ' ');
    // Unclosed variant: drop from the opening tag to the end.
    const unclosed = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'i');
    out = out.replace(unclosed, ' ');
  }
  return out;
}

/**
 * Convert an HTML fragment to plain text, preserving paragraph structure as
 * newlines. Whitespace inside a line is collapsed; runs of more than two
 * blank lines are squashed. Entities are decoded after tags are removed so a
 * literal `&lt;b&gt;` in the source survives as text.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  let out = stripNonContent(html);

  out = out.replace(new RegExp(`<\\/?(?:${PARAGRAPH_ELEMENTS.join('|')})\\b[^>]*>`, 'gi'), '\n');
  out = out.replace(new RegExp(`<(?:${ITEM_ELEMENTS.join('|')})\\b[^>]*>`, 'gi'), '\n');
  out = out.replace(new RegExp(`<\\/(?:${ITEM_ELEMENTS.join('|')})\\s*>`, 'gi'), '');
  // Everything else becomes a space so adjacent inline text does not fuse.
  out = out.replace(/<[^>]+>/g, ' ');

  out = decodeEntities(out);

  // Normalise whitespace per line, keep line structure.
  const lines = out
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim());

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Flatten any text (HTML or plain) to a single whitespace-normalised line. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Rough check for "is this HTML rather than plain text?" */
export function looksLikeHtml(input: string): boolean {
  return /<\s*(a|div|p|table|html|body|span|br|td)\b[^>]*>/i.test(input);
}

/**
 * Find the inner HTML of the first element carrying `attr="value"`. Walks
 * forward counting nested tags of the same name so nested `<div>`s do not
 * truncate the result (v1's non-greedy `</div>` match did). Returns null if
 * the element is absent.
 */
export function innerHtmlOfElement(html: string, attr: string, value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\b${attr}\\s*=\\s*["']${escaped}["'][^>]*>`, 'i');
  const open = openRe.exec(html);
  if (!open) return null;

  const tag = open[1].toLowerCase();
  const start = open.index + open[0].length;
  if (open[0].endsWith('/>')) return '';

  const tagRe = new RegExp(`<(\\/?)${tag}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = start;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  // Unclosed: take the rest.
  return html.slice(start);
}
