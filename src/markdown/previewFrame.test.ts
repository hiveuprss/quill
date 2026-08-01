import { describe, expect, it, vi } from 'vitest';
import { clearPreview, setPreviewMarkdown } from './previewFrame';

describe('previewFrame', () => {
  it('sets sandboxed blob url and clears it', () => {
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    URL.createObjectURL = create as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL;

    const iframe = document.createElement('iframe');
    setPreviewMarkdown(iframe, '# Hi');
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('src') || iframe.src).toContain('blob:test');
    clearPreview(iframe);
    expect(revoke).toHaveBeenCalled();
    expect(iframe.getAttribute('src')).toBeNull();
  });
});
