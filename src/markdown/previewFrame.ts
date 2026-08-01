import { buildPreviewDocument, renderPreviewHtml } from './previewHtml';

let lastUrl: string | null = null;

export function setPreviewMarkdown(iframe: HTMLIFrameElement, markdown: string): void {
  const html = renderPreviewHtml(markdown);
  const doc = buildPreviewDocument(html);
  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = url;
  iframe.removeAttribute('srcdoc');
  iframe.setAttribute('sandbox', ''); // no scripts, opaque — static HTML only
  iframe.src = url;
}

export function clearPreview(iframe: HTMLIFrameElement): void {
  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }
  iframe.removeAttribute('src');
}
