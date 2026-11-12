import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings, type AppSettings } from '../db/draftsDb';
import {
  disconnectKeychain,
  lock,
  setIdleTimeoutMin,
  unlock,
  wipeLocal,
} from '../crypto/authSession';
import type { AuthMethod } from '../crypto/authSession';
import { applyLocalePreference } from '../i18n/I18nProvider';
import { localizeError } from '../i18n/mapError';
import { applyTheme, type ThemeId } from '../theme/applyTheme';

function wipeConfirmMatches(input: string, username: string): boolean {
  const typed = input.trim().replace(/^@/, '').toLowerCase();
  return typed === username.trim().toLowerCase();
}

export function SettingsPage({
  enrolled,
  username,
  postingPubkey,
  vaultStale = false,
  authMethod = 'none',
  onStatusChange,
}: {
  enrolled: boolean;
  username: string | null;
  postingPubkey: string | null;
  vaultStale?: boolean;
  authMethod?: AuthMethod;
  onStatusChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [idle, setIdle] = useState(10);
  const [locale, setLocale] = useState<AppSettings['locale']>('system');
  const [theme, setTheme] = useState<ThemeId>('light');
  const [wipeName, setWipeName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isKeychain = authMethod === 'keychain';

  useEffect(() => {
    void getSettings().then((s) => {
      setIdle(s.idleTimeoutMin);
      setLocale(s.locale);
      setTheme(s.theme);
      applyTheme(s.theme);
      setIdleTimeoutMin(s.idleTimeoutMin);
    });
  }, []);

  async function saveIdle(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const current = await getSettings();
      await saveSettings({ ...current, idleTimeoutMin: idle });
      setIdleTimeoutMin(idle);
      setMsg(t('settings.msgIdleSaved'));
    } catch (error) {
      setErr(localizeError(error instanceof Error ? error.message : String(error), t));
    }
  }

  async function saveLocale(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const current = await getSettings();
      await saveSettings({ ...current, locale });
      await applyLocalePreference(locale);
      // use i18n.t after changeLanguage — hook `t` can still be bound to the prior lng
      setMsg(i18n.t('settings.msgLocaleSaved'));
    } catch (error) {
      setErr(localizeError(error instanceof Error ? error.message : String(error), t));
    }
  }

  async function onThemeChange(next: ThemeId) {
    setErr(null);
    const prev = theme;
    setTheme(next);
    applyTheme(next);
    try {
      const current = await getSettings();
      await saveSettings({ ...current, theme: next });
      setMsg(i18n.t('settings.msgThemeSaved'));
    } catch (error) {
      setTheme(prev);
      applyTheme(prev);
      setErr(localizeError(error instanceof Error ? error.message : String(error), t));
    }
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await unlock(passphrase);
      setPassphrase('');
      setMsg(t('settings.msgUnlocked'));
      onStatusChange();
    } catch (error) {
      setErr(localizeError(error instanceof Error ? error.message : String(error), t));
    }
  }

  async function onLock() {
    await lock();
    setMsg(t('settings.msgLocked'));
    onStatusChange();
  }

  async function wipe(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!username || !wipeConfirmMatches(wipeName, username)) {
      setErr(t('settings.errWipeConfirm'));
      return;
    }
    if (isKeychain) {
      await disconnectKeychain();
      setWipeName('');
      setMsg(t('settings.msgKeychainDisconnected'));
    } else {
      await wipeLocal();
      setWipeName('');
      setMsg(t('settings.msgWiped'));
    }
    onStatusChange();
  }

  return (
    <div className="page settings">
      <h1 className="page-title">{t('settings.title')}</h1>

      {msg && (
        <div className="banner info" role="status">
          {msg}
        </div>
      )}
      {err && (
        <div className="banner danger" role="alert">
          {err}
        </div>
      )}

      <section className="settings-section">
        <h2>{t('settings.language')}</h2>
        <p className="settings-help">{t('settings.languageHelp')}</p>
        <form className="settings-control" onSubmit={(e) => void saveLocale(e)}>
          <select
            aria-label={t('settings.language')}
            value={locale}
            onChange={(e) => setLocale(e.target.value as AppSettings['locale'])}
          >
            <option value="system">{t('settings.localeSystem')}</option>
            <option value="en">{t('settings.localeEn')}</option>
            <option value="es">{t('settings.localeEs')}</option>
          </select>
          <button type="submit" className="btn">
            {t('common.save')}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>{t('settings.theme')}</h2>
        <p className="settings-help">{t('settings.themeHelp')}</p>
        <div className="settings-control">
          <select
            aria-label={t('settings.theme')}
            value={theme}
            onChange={(e) => void onThemeChange(e.target.value as ThemeId)}
          >
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
            <option value="honey">{t('settings.themeHoney')}</option>
            <option value="nocturne">{t('settings.themeNocturne')}</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2>{isKeychain ? t('settings.keychain') : t('settings.vault')}</h2>
        {enrolled ? (
          <>
            {!isKeychain && vaultStale ? (
              <div className="banner danger" role="alert">
                {t('settings.vaultStale')}
              </div>
            ) : null}
            <p className="settings-meta">
              {isKeychain
                ? t('settings.connectedAs', { username })
                : t('settings.enrolledAs', { username })}
              {!isKeychain && postingPubkey ? (
                <span className="settings-pubkey">
                  {t('settings.postingPubkey', { pubkey: postingPubkey })}
                </span>
              ) : null}
              {isKeychain ? (
                <span className="settings-pubkey">{t('settings.methodKeychain')}</span>
              ) : null}
            </p>
            {!isKeychain && (
              <form className="settings-stack" onSubmit={(e) => void onUnlock(e)}>
                <label>
                  {t('settings.unlockPassphrase')}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                </label>
                <div className="row-actions">
                  <button type="submit" className="btn primary">
                    {t('settings.unlock')}
                  </button>
                  <button type="button" className="btn" onClick={() => void onLock()}>
                    {t('settings.lock')}
                  </button>
                </div>
              </form>
            )}
            <form className="settings-stack" onSubmit={(e) => void wipe(e)}>
              <label>
                {isKeychain
                  ? t('settings.disconnectLabel', { username })
                  : t('settings.wipeLabel', { username })}
                <input value={wipeName} onChange={(e) => setWipeName(e.target.value)} />
              </label>
              <button type="submit" className="btn danger">
                {isKeychain ? t('settings.disconnectButton') : t('settings.wipeButton')}
              </button>
            </form>
          </>
        ) : (
          <p className="settings-help">{t('settings.notEnrolled')}</p>
        )}
      </section>

      {!isKeychain && (
        <section className="settings-section">
          <h2>{t('settings.lockSection')}</h2>
          <form className="settings-control" onSubmit={(e) => void saveIdle(e)}>
            <label className="settings-inline-label">
              {t('settings.idleTimeout')}
              <select value={idle} onChange={(e) => setIdle(Number(e.target.value))}>
                {[5, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn">
              {t('common.save')}
            </button>
          </form>
        </section>
      )}

      <section className="settings-section settings-section-last">
        <h2>{t('settings.security')}</h2>
        <p className="settings-help">
          {isKeychain ? t('settings.securityBodyKeychain') : t('settings.securityBody')}
        </p>
      </section>
    </div>
  );
}
