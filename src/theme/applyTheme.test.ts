import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, isThemeId, readCachedTheme } from './applyTheme';

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    localStorage.removeItem('hivequill_theme');
  });

  it('recognizes theme ids', () => {
    expect(isThemeId('light')).toBe(true);
    expect(isThemeId('nocturne')).toBe(true);
    expect(isThemeId('neon')).toBe(false);
  });

  it('sets data-theme and color-scheme', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('honey');
    expect(document.documentElement.getAttribute('data-theme')).toBe('honey');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('caches theme for boot flash prevention', () => {
    expect(readCachedTheme()).toBe('light');
    applyTheme('nocturne');
    expect(localStorage.getItem('hivequill_theme')).toBe('nocturne');
    expect(readCachedTheme()).toBe('nocturne');
  });
});
