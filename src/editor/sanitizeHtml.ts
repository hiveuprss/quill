import DOMPurify from 'dompurify';

/** Shared HTML sanitizer for TipTap ingest (markdown load + paste). */
export function sanitizeEditorHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: [
      'center',
      'details',
      'summary',
      'sub',
      'sup',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'colgroup',
      'col',
    ],
    ADD_ATTR: ['class', 'open', 'href', 'src', 'alt', 'colspan', 'rowspan', 'contenteditable'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'meta'],
    FORBID_ATTR: [
      'style',
      'onerror',
      'onclick',
      'onload',
      'onmouseover',
      'onfocus',
      'onblur',
      'srcdoc',
    ],
    ALLOW_DATA_ATTR: false,
  });
}
