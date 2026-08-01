import { describe, expect, it } from 'vitest';
import { resolveLocale } from './resolveLocale';

describe('resolveLocale', () => {
  it('honors explicit en and es', () => {
    expect(resolveLocale('en', 'es-MX')).toBe('en');
    expect(resolveLocale('es', 'en-US')).toBe('es');
  });

  it('maps system preference from browser language', () => {
    expect(resolveLocale('system', 'es')).toBe('es');
    expect(resolveLocale('system', 'es-ES')).toBe('es');
    expect(resolveLocale('system', 'en-US')).toBe('en');
    expect(resolveLocale('system', 'fr-FR')).toBe('en');
  });
});
