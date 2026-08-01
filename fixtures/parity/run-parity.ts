/**
 * Golden-file parity check (Markdown helpers; no DOM).
 * Run: docker compose run --rm app npm run test:parity
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMarkdown, markdownToHtml } from '../../src/editor/markdown.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(dir, 'sample-basic.md'), 'utf8');

const html = markdownToHtml(sample);
const roundTrip = htmlToMarkdown(html);

const checks: [string, boolean][] = [
  ['html contains center', /<center>/i.test(html)],
  ['html contains heading', /<h1>/i.test(html)],
  ['round-trip keeps title', /Hello Hivequill/.test(roundTrip)],
  ['round-trip keeps bold marker or word', /\*\*bold\*\*|bold/.test(roundTrip)],
  ['youtube url preserved in source sample', /youtube\.com\/watch/.test(sample)],
  ['no script tags introduced', !/<script/i.test(html)],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('OK  ', name);
  }
}

if (failed) {
  console.error(`\n${failed} parity check(s) failed`);
  process.exit(1);
}
console.log('\nParity checks passed');
