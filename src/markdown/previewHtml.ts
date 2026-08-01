import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ThemeId } from '../theme/applyTheme';

/**
 * Preview uses marked + DOMPurify (not @hiveio/content-renderer).
 * content-renderer pulls universe-log which calls new Function() and breaks under CSP
 * without 'unsafe-eval'. Portable Hive HTML helpers are kept via ADD_TAGS.
 */

marked.setOptions({ gfm: true, breaks: true });

const YT =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/g;
const SPEAK = /https?:\/\/(?:www\.)?3speak\.tv\/watch\?v=([^\s)<]+)/g;

function staticVideoCards(md: string): string {
  let out = md;
  out = out.replace(YT, (_m, id: string) => {
    const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const href = `https://www.youtube.com/watch?v=${id}`;
    return `\n\n<p class="hq-video-card"><a href="${href}" rel="noopener noreferrer"><img src="${thumb}" alt="YouTube video" /><span>Watch on YouTube</span></a></p>\n\n`;
  });
  out = out.replace(SPEAK, (_m, id: string) => {
    const href = `https://3speak.tv/watch?v=${id}`;
    return `\n\n<p class="hq-video-card"><a href="${href}" rel="noopener noreferrer"><span>Watch on 3Speak: ${id}</span></a></p>\n\n`;
  });
  return out;
}

function linkifyMentions(html: string): string {
  return html
    .replace(
      /(^|[\s>])@([a-z0-9.-]{3,16})\b/gi,
      '$1<a href="https://peakd.com/@$2" rel="noopener noreferrer">@$2</a>',
    )
    .replace(
      /(^|[\s>])#([a-z0-9-]{2,})\b/gi,
      '$1<a href="https://peakd.com/trending/$2" rel="noopener noreferrer">#$2</a>',
    );
}

export function renderPreviewHtml(markdown: string): string {
  const prepared = staticVideoCards(markdown);
  const raw = marked.parse(prepared, { async: false }) as string;
  const linked = linkifyMentions(raw);
  return DOMPurify.sanitize(linked, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['center', 'details', 'summary', 'sub', 'sup'],
    ADD_ATTR: ['class', 'open', 'target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload'],
  });
}

type PreviewPalette = {
  ink: string;
  paper: string;
  muted: string;
  accent: string;
  codeBg: string;
  codeFg: string;
  border: string;
  cardBg: string;
};

const PREVIEW_THEMES: Record<ThemeId, PreviewPalette> = {
  light: {
    ink: '#1a1f1c',
    paper: '#faf7f0',
    muted: '#444',
    accent: '#2f5d50',
    codeBg: '#1a1f1c',
    codeFg: '#e8e0d0',
    border: '#d8d0c0',
    cardBg: '#fff',
  },
  dark: {
    ink: '#e8e6e1',
    paper: '#141816',
    muted: '#a8a49c',
    accent: '#7eb8a4',
    codeBg: '#0c0e0d',
    codeFg: '#e8e0d0',
    border: '#2a302c',
    cardBg: '#1c211e',
  },
  honey: {
    ink: '#2a1a0a',
    paper: '#fff6e0',
    muted: '#6a4a28',
    accent: '#a65c1a',
    codeBg: '#2a1a0a',
    codeFg: '#ffe8c0',
    border: '#e0c890',
    cardBg: '#fffaf0',
  },
  nocturne: {
    ink: '#dce8f2',
    paper: '#0b1520',
    muted: '#8aa0b4',
    accent: '#6eb0d8',
    codeBg: '#061018',
    codeFg: '#dce8f2',
    border: '#1c3044',
    cardBg: '#122232',
  },
};

export function resolvePreviewTheme(theme?: ThemeId | null): PreviewPalette {
  if (theme && theme in PREVIEW_THEMES) return PREVIEW_THEMES[theme];
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr && attr in PREVIEW_THEMES) return PREVIEW_THEMES[attr as ThemeId];
  }
  return PREVIEW_THEMES.light;
}

export function buildPreviewDocument(bodyHtml: string, theme?: ThemeId | null): string {
  const p = resolvePreviewTheme(theme);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  body{font-family:Georgia,"Times New Roman",serif;line-height:1.65;color:${p.ink};padding:1.5rem;margin:0;background:${p.paper};max-width:40rem}
  img{max-width:100%;height:auto}
  pre{background:${p.codeBg};color:${p.codeFg};padding:1rem;overflow:auto;border-radius:4px}
  code{font-family:ui-monospace,monospace;font-size:.9em}
  blockquote{border-left:3px solid ${p.accent};margin:1rem 0;padding-left:1rem;color:${p.muted}}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid ${p.border};padding:.4rem .6rem}
  center{display:block;text-align:center}
  .pull-left{float:left;margin:0 1rem 1rem 0;max-width:45%}
  .pull-right{float:right;margin:0 0 1rem 1rem;max-width:45%}
  .hq-video-card a{display:block;border:1px solid ${p.border};padding:1rem;text-decoration:none;color:${p.ink};background:${p.cardBg}}
  .hq-video-card img{display:block;width:100%;margin-bottom:.5rem}
  a{color:${p.accent}}
  </style></head><body>${bodyHtml}</body></html>`;
}
