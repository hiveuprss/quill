import { useEffect, type ReactNode } from 'react';
import { getSettings } from '../db/draftsDb';
import { applyTheme, type ThemeId } from './applyTheme';

export async function applyThemePreference(theme: ThemeId): Promise<void> {
  applyTheme(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) applyTheme(settings.theme);
      } catch {
        if (!cancelled) applyTheme('light');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return children;
}
