import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { signingClient } from '../crypto/signingClient';
import { lookupAccount } from '../hive/account';
import { localizeError } from '../i18n/mapError';

type Step = 'user' | 'looking' | 'key' | 'pass' | 'enrolling';

function passphraseScore(pw: string): number {
  let s = 0;
  if (pw.length >= 12) s += 1;
  if (pw.length >= 16) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}

export function AuthPage({
  onDone,
  enrolled = false,
}: {
  onDone: () => void;
  enrolled?: boolean;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [wif, setWif] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<Step>('user');
  const [error, setError] = useState<string | null>(null);
  const [dualMsg, setDualMsg] = useState<string | null>(null);
  const [acceptDual, setAcceptDual] = useState(false);
  const lookupGen = useRef(0);

  const score = passphraseScore(passphrase);
  const busy = step === 'looking' || step === 'enrolling';

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim().toLowerCase();
    if (!name) {
      setError(t('auth.errEnterUsername'));
      return;
    }
    const gen = ++lookupGen.current;
    setStep('looking');
    try {
      const account = await lookupAccount(name);
      if (gen !== lookupGen.current) return;
      if (!account) throw new Error(t('auth.errAccountNotFound'));
      setStep('key');
    } catch (err) {
      if (gen !== lookupGen.current) return;
      setError(localizeError(err instanceof Error ? err.message : String(err), t));
      setStep('user');
    }
  }

  function cancelLookup() {
    lookupGen.current += 1;
    setStep('user');
    setError(null);
  }

  function toPass(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!wif.trim().startsWith('5')) {
      setError(t('auth.errWif'));
      return;
    }
    setStep('pass');
  }

  async function enroll(e: FormEvent, forceDual = false) {
    e.preventDefault();
    setError(null);
    setDualMsg(null);
    if (passphrase.length < 12) {
      setError(t('auth.errPassphraseLen'));
      return;
    }
    if (score < 3) {
      setError(t('auth.errPassphraseWeak'));
      return;
    }
    if (passphrase !== confirm) {
      setError(t('auth.errPassphraseMismatch'));
      return;
    }
    setStep('enrolling');
    const wifValue = wif;
    const passValue = passphrase;
    try {
      const res = await signingClient.enroll({
        username: username.trim().toLowerCase(),
        wif: wifValue,
        passphrase: passValue,
        acceptDual: forceDual || acceptDual,
      });
      setWif('');
      setPassphrase('');
      setConfirm('');
      try {
        await navigator.clipboard.writeText('');
      } catch {
        /* clipboard may be blocked */
      }
      if (res.needsDualConfirm) {
        setDualMsg(String(res.message));
        setStep('pass');
        return;
      }
      onDone();
    } catch (err) {
      setError(localizeError(err instanceof Error ? err.message : String(err), t));
      setStep('pass');
    }
  }

  if (enrolled) {
    return (
      <div className="page">
        <h1 className="page-title">{t('auth.title')}</h1>
        <p className="muted">{t('auth.alreadyEnrolled')}</p>
        <Link className="btn primary" to="/settings">
          {t('auth.goSettings')}
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">{t('auth.title')}</h1>
      <p className="muted">{t('auth.intro')}</p>

      {error && (
        <div className="banner danger" role="alert">
          {error}
        </div>
      )}
      {dualMsg && (
        <div className="banner">
          {dualMsg}
          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              onClick={(ev) => {
                setAcceptDual(true);
                void enroll(ev as unknown as FormEvent, true);
              }}
            >
              {t('auth.dualContinue')}
            </button>
          </div>
        </div>
      )}

      {(step === 'user' || step === 'looking') && (
        <form className="form-stack" onSubmit={(e) => void lookup(e)}>
          <label>
            {t('auth.username')}
            <input
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button type="submit" className="btn primary" disabled={busy}>
              {step === 'looking' ? t('auth.lookingUp') : t('auth.continue')}
            </button>
            {step === 'looking' && (
              <button type="button" className="btn" onClick={cancelLookup}>
                {t('auth.cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {step === 'key' && (
        <form className="form-stack" onSubmit={toPass}>
          <p className="muted">
            {t('auth.accountFound', { username: username.trim().toLowerCase() })}
          </p>
          <label>
            {t('auth.wif')}
            <input
              type="password"
              autoComplete="off"
              value={wif}
              onChange={(e) => setWif(e.target.value)}
              required
            />
          </label>
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn" onClick={() => setStep('user')}>
              {t('auth.back')}
            </button>
            <button type="submit" className="btn primary">
              {t('auth.continue')}
            </button>
          </div>
        </form>
      )}

      {(step === 'pass' || step === 'enrolling') && (
        <form className="form-stack" onSubmit={(e) => void enroll(e)}>
          <label>
            {t('auth.passphrase')}
            <input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={step === 'enrolling'}
              required
            />
            <div className="strength">
              <span style={{ width: `${(score / 5) * 100}%` }} />
            </div>
          </label>
          <label>
            {t('auth.confirmPassphrase')}
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={step === 'enrolling'}
              required
            />
          </label>
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="btn"
              disabled={step === 'enrolling'}
              onClick={() => setStep('key')}
            >
              {t('auth.back')}
            </button>
            <button type="submit" className="btn primary" disabled={step === 'enrolling'}>
              {step === 'enrolling' ? t('auth.encrypting') : t('auth.encryptStore')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
