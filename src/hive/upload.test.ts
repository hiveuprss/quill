import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedImageUrl, uploadSignedImage } from './upload';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('upload', () => {
  it('allowlists images.hive.blog https only', () => {
    expect(isAllowedImageUrl('https://images.hive.blog/DQm/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('http://images.hive.blog/x')).toBe(false);
    expect(isAllowedImageUrl('https://evil.com/x')).toBe(false);
    expect(isAllowedImageUrl('not-a-url')).toBe(false);
  });

  it('uploadSignedImage returns allowed url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://images.hive.blog/DQm/ok.jpg' }),
        text: async () => '',
        clone() {
          return this;
        },
      }),
    );
    const url = await uploadSignedImage('alice', 'sig', new Blob(['x']));
    expect(url).toBe('https://images.hive.blog/DQm/ok.jpg');
  });

  it('maps 413 / 429 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        text: async () => '',
      }),
    );
    await expect(uploadSignedImage('a', 's', new Blob(['x']))).rejects.toThrow(/too large/i);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => '',
      }),
    );
    await expect(uploadSignedImage('a', 's', new Blob(['x']))).rejects.toThrow(/rate limited/i);
  });

  it('rejects non-allowlisted response urls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://evil.com/x.jpg' }),
        text: async () => '',
        clone() {
          return this;
        },
      }),
    );
    await expect(uploadSignedImage('a', 's', new Blob(['x']))).rejects.toThrow(/rejected/i);
  });
});
