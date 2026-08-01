import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { getSettings } from '../db/draftsDb';
import i18n, { applyDocumentLang } from './index';
import { resolveLocale, type LocalePreference } from './resolveLocale';

export async function applyLocalePreference(preference: LocalePreference): Promise<string> {
  const lng = resolveLocale(preference);
  await i18n.changeLanguage(lng);
  await applyDocumentLang(lng);
  return lng;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) await applyLocalePreference(settings.locale);
      } catch {
        if (!cancelled) await applyLocalePreference('system');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
