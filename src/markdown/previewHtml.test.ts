import { describe, expect, it } from 'vitest';
import { buildPreviewDocument, renderPreviewHtml } from './previewHtml';

describe('previewHtml', () => {
  it('renders markdown and strips dangerous tags', () => {
    const html = renderPreviewHtml('# Title\n\nHello <script>alert(1)</script>');
    expect(html).toMatch(/Title/);
    expect(html).not.toMatch(/<script/i);
  });

  it('creates static YouTube and 3Speak cards', () => {
    const html = renderPreviewHtml(
      'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ and https://3speak.tv/watch?v=alice/foo',
    );
    expect(html).toContain('hq-video-card');
    expect(html).toContain('youtube.com/watch');
    expect(html).toContain('3speak.tv/watch');
    expect(html).not.toMatch(/<iframe/i);
  });

  it('linkifies mentions and hashtags', () => {
    const html = renderPreviewHtml('Hello @alice and #hive');
    expect(html).toContain('peakd.com/@alice');
    expect(html).toContain('peakd.com/trending/hive');
  });

  it('buildPreviewDocument wraps body with styles', () => {
    const doc = buildPreviewDocument('<p>hi</p>');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('<p>hi</p>');
    expect(doc).toContain('font-family');
  });

  it('buildPreviewDocument follows nocturne palette', () => {
    const doc = buildPreviewDocument('<p>hi</p>', 'nocturne');
    expect(doc).toContain('#0b1520');
    expect(doc).toContain('#dce8f2');
  });
});
