import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, innerHtmlOfElement, looksLikeHtml } from './html-text';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities and leaves unknown ones alone', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x2013; &ndash; &nbsp;x')).toBe('a & b <c> "d" \'e\' – –  x');
    expect(decodeEntities('&bogus; &#xZZ;')).toBe('&bogus; &#xZZ;');
  });
});

describe('htmlToText', () => {
  it('drops scripts/styles/comments and turns blocks into lines', () => {
    const html = '<style>p{}</style><script>var x=1;</script><!-- c --><div>One<br>Two</div><p>Three &amp; <b>four</b></p>';
    expect(htmlToText(html)).toBe('One\nTwo\n\nThree & four');
  });

  it('does not decode entities that were literal text before tag stripping', () => {
    expect(htmlToText('<p>&lt;b&gt;not bold&lt;/b&gt;</p>')).toBe('<b>not bold</b>');
  });

  it('returns empty for empty input', () => {
    expect(htmlToText('')).toBe('');
  });
});

describe('innerHtmlOfElement', () => {
  it('handles nested elements of the same tag', () => {
    const html = '<div data-automation="x"><div>a<div>b</div></div>c</div><div>after</div>';
    expect(innerHtmlOfElement(html, 'data-automation', 'x')).toBe('<div>a<div>b</div></div>c');
  });

  it('returns null when absent and the tail when unclosed', () => {
    expect(innerHtmlOfElement('<div></div>', 'data-automation', 'x')).toBeNull();
    expect(innerHtmlOfElement('<span data-automation="x">open', 'data-automation', 'x')).toBe('open');
  });
});

describe('looksLikeHtml', () => {
  it('distinguishes markup from text containing angle brackets', () => {
    expect(looksLikeHtml('<p>hi</p>')).toBe(true);
    expect(looksLikeHtml('a < b and c > d')).toBe(false);
  });
});
