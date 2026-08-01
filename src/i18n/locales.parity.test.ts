import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';

function keysOf(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') return keysOf(v, path);
    return [path];
  });
}

describe('locale catalogs', () => {
  it('es has the same keys as en', () => {
    expect(keysOf(es).sort()).toEqual(keysOf(en).sort());
  });
});
