import { describe, expect, it } from 'vitest';
import { MIN_PUBLISH_BODY_CHARS, checkPublishContent, normalizePublishText } from './gates';

const longEnough = 'a'.repeat(MIN_PUBLISH_BODY_CHARS);

describe('publish content gates', () => {
  it('normalizes whitespace', () => {
    expect(normalizePublishText('  hello\n\nworld  ')).toBe('hello world');
  });

  it('rejects empty title', () => {
    const r = checkPublishContent({ title: '   ', bodyMarkdown: longEnough });
    expect(r).toEqual({
      ok: false,
      code: 'empty_title',
      bodyLen: MIN_PUBLISH_BODY_CHARS,
      minBody: MIN_PUBLISH_BODY_CHARS,
    });
  });

  it('rejects short body', () => {
    const r = checkPublishContent({ title: 'Hello', bodyMarkdown: 'too short' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('short_body');
      expect(r.bodyLen).toBe(9);
      expect(r.minBody).toBe(MIN_PUBLISH_BODY_CHARS);
    }
  });

  it('counts collapsed whitespace toward body length', () => {
    const spaced = `${'a'.repeat(40)}\n\n${'b'.repeat(40)}`;
    expect(checkPublishContent({ title: 'T', bodyMarkdown: spaced }).ok).toBe(true);
    expect(checkPublishContent({ title: 'T', bodyMarkdown: 'a'.repeat(79) }).ok).toBe(false);
  });

  it('accepts title + long enough body', () => {
    expect(checkPublishContent({ title: 'Hello Hive', bodyMarkdown: longEnough }).ok).toBe(true);
  });
});
