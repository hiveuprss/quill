import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

const LOCALE_CACHE_KEY = 'hivequill_locale';

function readCachedLng(): 'en' | 'es' {
  try {
    const v = localStorage.getItem(LOCALE_CACHE_KEY);
    if (v === 'en' || v === 'es') return v;
  } catch {
    /* private mode */
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: readCachedLng(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'es'],
  // React already escapes JSX text; keep false so apostrophes in copy are not double-encoded.
  // Never pass user strings into dangerouslySetInnerHTML / Trans HTML.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

export async function applyDocumentLang(lng: string): Promise<void> {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
  if (lng === 'en' || lng === 'es') {
    try {
      localStorage.setItem(LOCALE_CACHE_KEY, lng);
    } catch {
      /* private mode */
    }
  }
}
