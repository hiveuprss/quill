export type LocalePreference = 'system' | 'en' | 'es';
export type ResolvedLocale = 'en' | 'es';

/** Map Settings locale preference to a shipped language code. */
export function resolveLocale(
  preference: LocalePreference,
  browserLanguage: string = typeof navigator !== 'undefined' ? navigator.language : 'en',
): ResolvedLocale {
  if (preference === 'en' || preference === 'es') return preference;
  const base = browserLanguage.toLowerCase().split('-')[0] ?? 'en';
  return base === 'es' ? 'es' : 'en';
}
