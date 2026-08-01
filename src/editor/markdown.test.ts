import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  htmlToMarkdown,
  isSafeHref,
  markdownToHtml,
  sanitizePasteHtml,
} from './markdown';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/parity');

describe('markdown helpers', () => {
  it('parity fixture round-trips core Hive markup', () => {
    const sample = readFileSync(join(fixtureDir, 'sample-basic.md'), 'utf8');
    const html = markdownToHtml(sample);
    const roundTrip = htmlToMarkdown(html);
    expect(html).toMatch(/<center>/i);
    expect(html).toMatch(/<h1>/i);
    expect(roundTrip).toMatch(/Hello Hivequill/);
    expect(roundTrip).toMatch(/\*\*bold\*\*|bold/);
    expect(sample).toMatch(/youtube\.com\/watch/);
    expect(html).not.toMatch(/<script/i);
  });

  it('converts headings, emphasis, links, lists', () => {
    const html = markdownToHtml('## Hi\n\n**bold** and *em*\n\n- one\n- two\n');
    expect(html).toContain('<h2>Hi</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<ul>');
  });

  it('round-trips ordered lists', () => {
    const md = '1. one\n2. two\n';
    const html = markdownToHtml(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>one</li>');
    const back = htmlToMarkdown(html);
    expect(back).toMatch(/1\.\s+one/);
    expect(back).toMatch(/2\.\s+two/);
    expect(back).not.toMatch(/^- one/m);
  });

  it('round-trips GFM pipe tables', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const html = markdownToHtml(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    const back = htmlToMarkdown(html);
    expect(back).toMatch(/\| A \| B \|/);
    expect(back).toMatch(/\| 1 \| 2 \|/);
  });

  it('preserves center and spoiler islands on html→md', () => {
    const md = htmlToMarkdown('<center><p>mid</p></center><details><summary>Spoiler</summary><p>x</p></details>');
    expect(md).toContain('<center>');
    expect(md).toContain('details');
  });

  it('round-trips open details (with attrs) without tearing the island', () => {
    const fromEditor =
      '<details open=""><summary contenteditable="false">Spoiler</summary><div><p>Hidden body</p></div></details>';
    const md = htmlToMarkdown(fromEditor);
    expect(md).toMatch(/<details><summary>Spoiler<\/summary>\nHidden body\n<\/details>/);
    const html = markdownToHtml(md);
    expect(html).toMatch(/<details[^>]*open/i);
    expect(html).toContain('<div>');
    expect(html).toContain('Hidden body');
    expect(html).not.toMatch(/<p>\s*<\/details>/i);
  });

  it('sanitizePasteHtml strips scripts and handlers', () => {
    const dirty = `<p onclick="alert(1)">x</p><script>evil()</script><a href="javascript:alert(1)">a</a>`;
    const clean = sanitizePasteHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it('markdownToHtml strips raw HTML and rejects attribute-breakout image urls', () => {
    const html = markdownToHtml(
      'Hello <script>alert(1)</script>\n\n![x](https://evil.example/a.jpg" onerror="alert(1))\n',
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    // leftover markdown may mention onerror as text; must not become an HTML attribute
    expect(html).not.toMatch(/<[a-z][^>]*\sonerror=/i);
    expect(html).toMatch(/Hello/);
  });

  it('isSafeHref accepts http(s)/mailto/# only', () => {
    expect(isSafeHref('https://peakd.com')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('mailto:a@b.c')).toBe(true);
    expect(isSafeHref('#anchor')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,x')).toBe(false);
  });
});
