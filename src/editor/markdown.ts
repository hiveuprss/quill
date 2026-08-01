import { sanitizeEditorHtml } from './sanitizeHtml';

/** Lightweight Markdown ↔ HTML helpers for TipTap (Hive-oriented). */

const DETAILS_ISLAND_RE = /<details\b[^>]*>[\s\S]*?<\/details>/gi;

function stripOuterP(html: string): string {
  return html.replace(/^<p>|<\/p>$/gi, '').trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellText(html: string): string {
  return stripTags(html).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function tableToMarkdown(inner: string): string {
  const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cellText(c[1])),
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] || '');
  const header = pad(rows[0]);
  const body = rows.slice(1).map(pad);
  const fmt = (r: string[]) => `| ${r.join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;
  return [fmt(header), sep, ...body.map(fmt)].join('\n') + '\n\n';
}

function listItemsMarkdown(inner: string, ordered: boolean): string {
  const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  return (
    items
      .map((m, i) => {
        const text = htmlToMarkdown(m[1]).replace(/\n+/g, ' ').trim();
        return ordered ? `${i + 1}. ${text}` : `- ${text}`;
      })
      .join('\n') + '\n\n'
  );
}

export function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<center>([\s\S]*?)<\/center>/gi, (_, inner) => `<center>\n${stripOuterP(inner)}\n</center>\n\n`);
  md = md.replace(/<div class="pull-left">([\s\S]*?)<\/div>/gi, (_, inner) => `<div class="pull-left">\n${stripOuterP(inner)}\n</div>\n\n`);
  md = md.replace(/<div class="pull-right">([\s\S]*?)<\/div>/gi, (_, inner) => `<div class="pull-right">\n${stripOuterP(inner)}\n</div>\n\n`);
  md = md.replace(
    /<details\b[^>]*>[\s\S]*?<summary\b[^>]*>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/gi,
    (_, inner) => {
      const innerMd = htmlToMarkdown(inner).trim();
      return `<details><summary>Spoiler</summary>\n${innerMd}\n</details>\n\n`;
    },
  );

  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => tableToMarkdown(inner));

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) =>
    `${stripTags(inner)
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n')}\n\n`,
  );
  md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => `\`\`\`\n${decode(code)}\n\`\`\`\n\n`);
  md = md.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*');
  md = md.replace(/<s>([\s\S]*?)<\/s>/gi, '~~$1~~');
  md = md.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]+src="([^"]+)"[^>]*\/?>/gi, '![]($1)');
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => listItemsMarkdown(inner, true));
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => listItemsMarkdown(inner, false));
  md = md.replace(/<\/?li[^>]*>/gi, '');
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<\/?div[^>]*>/gi, '\n');
  md = md.replace(/<\/?thead[^>]*>/gi, '');
  md = md.replace(/<\/?tbody[^>]*>/gi, '');
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim() + '\n';
}

/** Normalize a details island into TipTap-friendly open+div structure. */
function normalizeDetailsForEditor(html: string): string {
  const m = html.match(
    /<details\b[^>]*>[\s\S]*?<summary\b[^>]*>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/i,
  );
  if (!m) return html;
  let inner = m[1].trim();
  inner = inner.replace(/^<div\b[^>]*>([\s\S]*)<\/div>$/i, '$1').trim();
  if (inner && !/^<(p|h\d|ul|ol|pre|blockquote|div|table)\b/i.test(inner)) {
    inner = `<p>${inner.replace(/\n/g, '<br/>')}</p>`;
  }
  if (!inner) inner = '<p></p>';
  return `<details open><summary>Spoiler</summary><div>${inner}</div></details>`;
}

function isTableSepLine(line: string): boolean {
  return /^\|?[\s|:-]+$/u.test(line.trim()) && /-/.test(line);
}

function splitPipeRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

function gfmTableBlockToHtml(block: string): string {
  const lines = block.trim().split('\n').filter(Boolean);
  if (lines.length < 2 || !isTableSepLine(lines[1])) return block;
  const header = splitPipeRow(lines[0]);
  const body = lines.slice(2).map(splitPipeRow);
  let out = '<table><thead><tr>';
  out += header.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  out += '</tr></thead><tbody>';
  for (const row of body) {
    out += '<tr>';
    out += header.map((_, i) => `<td>${escapeHtml(row[i] || '')}</td>`).join('');
    out += '</tr>';
  }
  out += '</tbody></table>';
  return out;
}

export function markdownToHtml(md: string): string {
  const islands: string[] = [];
  let html = md.replace(DETAILS_ISLAND_RE, (match) => {
    const token = `@@DETAILS_ISLAND_${islands.length}@@`;
    islands.push(normalizeDetailsForEditor(match));
    return `\n\n${token}\n\n`;
  });

  // GFM tables (pipe rows)
  html = html.replace(/(?:^\|.+\|[ \t]*\n){2,}/gm, (block) => {
    const token = `@@TABLE_ISLAND_${islands.length}@@`;
    islands.push(gfmTableBlockToHtml(block));
    return `\n\n${token}\n\n`;
  });

  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => `<pre><code>${escapeHtml(code)}</code></pre>`);
  html = html.replace(/^### (.+)$/gm, (_, t) => `<h3>${escapeHtml(t)}</h3>`);
  html = html.replace(/^## (.+)$/gm, (_, t) => `<h2>${escapeHtml(t)}</h2>`);
  html = html.replace(/^# (.+)$/gm, (_, t) => `<h1>${escapeHtml(t)}</h1>`);
  html = html.replace(/^---$/gm, '<hr/>');
  html = html.replace(/^> (.+)$/gm, (_, t) => `<blockquote><p>${escapeHtml(t)}</p></blockquote>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${escapeHtml(t)}</strong>`);
  html = html.replace(/\*([^*]+)\*/g, (_, t) => `<em>${escapeHtml(t)}</em>`);
  html = html.replace(/~~([^~]+)~~/g, (_, t) => `<s>${escapeHtml(t)}</s>`);
  html = html.replace(/`([^`]+)`/g, (_, t) => `<code>${escapeHtml(t)}</code>`);
  // Stop URL at whitespace/quotes so attribute breakouts cannot ride in the href/src.
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s"]+)\)/g, (_, alt, src) => {
    const trimmed = src.trim();
    if (!/^https?:\/\//i.test(trimmed)) return '';
    return `<img src="${escapeHtml(trimmed)}" alt="${escapeHtml(alt)}" />`;
  });
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"]+|#[^)\s"]*)\)/g, (_, label, href) => {
    return `<a href="${escapeHtml(href.trim())}">${escapeHtml(label)}</a>`;
  });

  // Ordered lists before bullets
  html = html.replace(/(?:^\d+\. .+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean);
    return `<ol>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>\n`;
  });
  html = html.replace(/(?:^- .+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((line) => line.replace(/^- /, '').trim())
      .filter(Boolean);
    return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>\n`;
  });

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (/^@@(?:DETAILS|TABLE)_ISLAND_\d+@@$/.test(t)) return t;
      if (/^<(h\d|ul|ol|pre|blockquote|hr|center|details|div|table)/i.test(t)) return t;
      // Inline transforms may already inject tags; only escape plain text blocks
      const body = /<[a-z/]/i.test(t) ? t : escapeHtml(t);
      return `<p>${body.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  html = html.replace(/@@DETAILS_ISLAND_(\d+)@@/g, (_, i) => islands[Number(i)] ?? '');
  html = html.replace(/@@TABLE_ISLAND_(\d+)@@/g, (_, i) => islands[Number(i)] ?? '');
  return sanitizeEditorHtml(html);
}

export function sanitizePasteHtml(html: string): string {
  return sanitizeEditorHtml(html);
}

export function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|#)/i.test(href);
}
