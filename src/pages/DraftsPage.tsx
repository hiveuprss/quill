import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useFocusTrap } from '../a11y/useFocusTrap';
import type { Draft } from '../db/draftsDb';
import { formatDateTime, formatRelativeTime } from '../i18n/format';

const DISCORD_URL = 'https://discord.gg/heGaVzSr';
const PEAKD_URL = 'https://peakd.com/@thequill';
const HIVE_URL = 'https://hive.io';

function HomeFooter() {
  const { t } = useTranslation();
  return (
    <footer className="home-footer">
      <p className="home-footer-powered">
        {t('drafts.footerPowered')}{' '}
        <a href={HIVE_URL} target="_blank" rel="noopener noreferrer">
          Hive
        </a>
      </p>
      <p className="home-footer-links muted">
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
          {t('drafts.footerDiscord')}
        </a>
        <span className="home-footer-sep" aria-hidden="true">
          ·
        </span>
        <a href={PEAKD_URL} target="_blank" rel="noopener noreferrer">
          {t('drafts.footerPeakd')}
        </a>
      </p>
    </footer>
  );
}

export function DraftsPage({
  drafts,
  onNew,
  onDelete,
}: {
  drafts: Draft[];
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(!!pending, dialogRef);

  function badgeLabel(status: Draft['status']): string {
    if (status === 'edited_locally') return t('drafts.statusEditedLocally');
    if (status === 'published') return t('drafts.statusPublished');
    return t('drafts.statusLocal');
  }

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setPending(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, busy]);

  async function confirmDelete() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await onDelete(pending.id);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  if (!drafts.length) {
    return (
      <div className="page empty">
        <h2>{t('drafts.emptyTitle')}</h2>
        <p className="muted">{t('drafts.emptyBody')}</p>
        <button type="button" className="btn primary" onClick={onNew}>
          {t('drafts.startWriting')}
        </button>
        <HomeFooter />
      </div>
    );
  }

  const pendingTitle = pending?.title.trim() || t('common.untitled');

  return (
    <div className="page">
      <div className="drafts-header">
        <h1 className="page-title">{t('drafts.title')}</h1>
        <button type="button" className="btn primary" onClick={onNew}>
          {t('drafts.newDraft')}
        </button>
      </div>
      <ul className="draft-list">
        {drafts.map((d) => {
          const title = d.title.trim() || t('common.untitled');
          return (
            <li key={d.id} className="draft-row">
              <Link to={`/compose/${d.id}`} className="draft-link">
                <strong>{title}</strong>
                <div className="draft-meta">
                  <span className="badge">{badgeLabel(d.status)}</span>
                  <time
                    dateTime={new Date(d.updatedAt).toISOString()}
                    title={formatDateTime(d.updatedAt, i18n.language)}
                  >
                    {formatRelativeTime(d.updatedAt, i18n.language)}
                  </time>
                </div>
              </Link>
              <button
                type="button"
                className="btn danger draft-delete"
                aria-label={t('drafts.deleteAria', { title })}
                onClick={() => setPending(d)}
              >
                {t('drafts.delete')}
              </button>
            </li>
          );
        })}
      </ul>

      {pending && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setPending(null);
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
              {t('drafts.deleteTitle')}
            </h2>
            <p id={descId} className="modal-body">
              {t('drafts.deleteBody', { title: pendingTitle })}
              {pending.status !== 'local' && <> {t('drafts.deleteBodyPublished')}</>}
            </p>
            <div className="modal-actions">
              <button
                ref={cancelRef}
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn danger solid"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? t('drafts.deleting') : t('drafts.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <HomeFooter />
    </div>
  );
}
