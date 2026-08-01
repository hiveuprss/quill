import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { Buffer } from 'buffer';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n, { applyDocumentLang } from '../i18n';

vi.mock('virtual:pwa-register', () => ({
  registerSW: () => undefined,
}));

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await applyDocumentLang('en');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// TipTap / ProseMirror helpers missing in jsdom
if (typeof document !== 'undefined') {
  if (!document.getSelection) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).getSelection = () => ({
      rangeCount: 0,
      getRangeAt: () => null,
      removeAllRanges: () => undefined,
      addRange: () => undefined,
    });
  }
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => document.body;
  }
}

if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

if (typeof URL !== 'undefined') {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:vitest-mock');
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
}
