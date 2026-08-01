export const THEME_IDS = ['light', 'dark', 'honey', 'nocturne'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

const LIGHT_SCHEMES = new Set<ThemeId>(['light', 'honey']);
const THEME_CACHE_KEY = 'hivequill_theme';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as readonly string[]).includes(value);
}

export function readCachedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_CACHE_KEY);
    if (isThemeId(v)) return v;
  } catch {
    /* private mode */
  }
  return 'light';
}

/** Apply theme to <html data-theme> and native form color-scheme. */
export function applyTheme(theme: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = LIGHT_SCHEMES.has(theme) ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* private mode */
  }
}
