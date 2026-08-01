import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../a11y/useFocusTrap';
import { signingClient } from '../crypto/signingClient';
import { localizeError } from '../i18n/mapError';

type Props = {
  open: boolean;
  reason?: string;
  onCancel: () => void;
  onUnlocked: () => void | Promise<void>;
};

export function UnlockModal({ open, reason, onCancel, onUnlocked }: Props) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (!open) return;
    setPassphrase('');
    setErr(null);
    setBusy(false);
    const tFocus = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(tFocus);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await signingClient.unlock(passphrase);
      setPassphrase('');
      await onUnlocked();
    } catch (error) {
      setErr(localizeError(error instanceof Error ? error.message : String(error), t));
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <h2 id={titleId} className="modal-title">
          {t('unlock.title')}
        </h2>
        <p id={descId} className="modal-body">
          {reason || t('unlock.body')}
        </p>
        <form className="form-stack modal-form" onSubmit={(e) => void submit(e)}>
          <label>
            {t('unlock.passphrase')}
            <input
              ref={inputRef}
              type="password"
              autoComplete="current-password"
              value={passphrase}
              disabled={busy}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setErr(null);
              }}
            />
          </label>
          {err && (
            <div className="banner danger" role="alert">
              {err}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn primary" disabled={busy || !passphrase}>
              {busy ? t('unlock.unlocking') : t('unlock.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
