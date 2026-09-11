import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ComposeEditor } from '../editor/ComposeEditor';
import { PublishSheet } from '../components/PublishSheet';
import { UnlockModal } from '../components/UnlockModal';
import type { Draft } from '../db/draftsDb';
import { saveDraft, slugifyPermlink } from '../db/draftsDb';
import { setPreviewMarkdown, clearPreview } from '../markdown/previewFrame';
import { armUploadGesture, signUploadChallenge } from '../crypto/authSession';
import type { AuthMethod } from '../crypto/authSession';
import { uploadSignedImage, isAllowedImageUrl } from '../hive/upload';
import { listMedia, rememberMedia } from '../db/mediaDb';
import type { ConnState } from '../components/ConnectivityPill';
import { formatNumber } from '../i18n/format';
import { localizeError } from '../i18n/mapError';
import { checkPublishContent } from '../publish/gates';

type Props = {
  draft: Draft;
  enrolled: boolean;
  unlocked: boolean;
  username: string | null;
  postingPubkey: string | null;
  authMethod?: AuthMethod;
  conn: ConnState;
  onDraftSaved: (d: Draft) => void;
  onStatusChange: () => void | Promise<void>;
};

export function ComposePage({
  draft: initial,
  enrolled,
  unlocked,
  username,
  postingPubkey,
  authMethod = 'none',
  conn,
  onDraftSaved,
  onStatusChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(initial);
  const [mode, setMode] = useState<'write' | 'preview' | 'publish'>('write');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [publishGateErr, setPublishGateErr] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const unlockedRef = useRef(unlocked);
  const unlockWaiter = useRef<{ resolve: () => void; reject: (err: Error) => void } | null>(
    null,
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  unlockedRef.current = unlocked;

  useEffect(() => {
    setDraft(initial);
    draftRef.current = initial;
  }, [initial.id]);

  useEffect(() => {
    if (mode !== 'preview' || !iframeRef.current) return;
    setPreviewMarkdown(iframeRef.current, draft.bodyMarkdown);
    return () => {
      if (iframeRef.current) clearPreview(iframeRef.current);
    };
  }, [mode, draft.bodyMarkdown]);

  function scheduleSave(next: Draft) {
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          let status = next.status;
          if (status === 'published') status = 'edited_locally';
          const toSave = { ...next, status, updatedAt: Date.now() };
          await saveDraft(toSave);
          draftRef.current = toSave;
          setDraft(toSave);
          onDraftSaved(toSave);
          setSaveStatus('saved');
        } catch {
          setSaveStatus('failed');
        }
      })();
    }, 800);
  }

  function patch(p: Partial<Draft>) {
    if (p.title !== undefined || p.bodyMarkdown !== undefined) {
      setPublishGateErr(null);
    }
    const next = { ...draftRef.current, ...p };
    draftRef.current = next;
    setDraft(next);
    scheduleSave(next);
  }

  const words = draft.bodyMarkdown.trim() ? draft.bodyMarkdown.trim().split(/\s+/).length : 0;

  const listRecentMedia = useCallback(
    () => listMedia(username || ''),
    [username],
  );

  function ensureUnlocked(): Promise<void> {
    if (authMethod === 'keychain' || unlockedRef.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      unlockWaiter.current = { resolve, reject };
      setUnlockOpen(true);
    });
  }

  function cancelUnlock() {
    setUnlockOpen(false);
    const waiter = unlockWaiter.current;
    unlockWaiter.current = null;
    waiter?.reject(new Error(t('compose.errUnlockCancelled')));
  }

  async function finishUnlock() {
    unlockedRef.current = true;
    setUnlockOpen(false);
    await onStatusChange();
    const waiter = unlockWaiter.current;
    unlockWaiter.current = null;
    waiter?.resolve();
  }

  async function uploadImageFile(file: File): Promise<string> {
    if (conn === 'offline' || conn === 'rpc_unreachable') {
      throw new Error(t('compose.errUploadNetwork'));
    }
    if (!enrolled || !username) {
      throw new Error(t('compose.errUploadNeedEnroll'));
    }
    await ensureUnlocked();
    const token = await armUploadGesture();
    const buf = await file.arrayBuffer();
    const signed = await signUploadChallenge(buf, token);
    const url = await uploadSignedImage(
      String(signed.username),
      String(signed.signature),
      file,
    );
    if (!isAllowedImageUrl(url)) throw new Error(t('compose.errUploadRejected'));
    try {
      await rememberMedia({ username, url });
    } catch {
      // Library persist must not block insert
    }
    return url;
  }

  async function onPickImage(file: File) {
    setUploadErr(null);
    try {
      const url = await uploadImageFile(file);
      const body = draftRef.current.bodyMarkdown.trim();
      patch({
        bodyMarkdown: `${body}\n\n![](${url})\n`,
      });
    } catch (err) {
      setUploadErr(localizeError(err instanceof Error ? err.message : String(err), t));
    }
  }

  const onUploadImage =
    enrolled && username
      ? async (file: File) => {
          setUploadErr(null);
          try {
            return await uploadImageFile(file);
          } catch (err) {
            const msg = localizeError(err instanceof Error ? err.message : String(err), t);
            setUploadErr(msg);
            throw err;
          }
        }
      : undefined;

  const canUpload = enrolled && !!username && conn !== 'offline' && conn !== 'rpc_unreachable';

  function tryOpenPublish() {
    setPublishGateErr(null);
    const gate = checkPublishContent(draftRef.current);
    if (!gate.ok) {
      setPublishGateErr(
        gate.code === 'empty_title'
          ? t('compose.errPublishTitle')
          : t('compose.errPublishBodyShort', {
              min: gate.minBody,
              count: gate.bodyLen,
            }),
      );
      return;
    }
    setMode('publish');
  }

  if (mode === 'publish') {
    return (
      <PublishSheet
        draft={draft}
        conn={conn}
        enrolled={enrolled}
        unlocked={unlocked}
        username={username}
        postingPubkey={postingPubkey}
        authMethod={authMethod}
        onUpdateDraft={(p) => patch(p)}
        onNeedEnroll={() => navigate('/auth')}
        onCancel={() => setMode('write')}
        onPublished={(d, _url) => {
          void saveDraft(d).then(() => {
            onDraftSaved(d);
            draftRef.current = d;
            setDraft(d);
          });
        }}
      />
    );
  }

  const permlink = draft.publishedPermlink || draft.permlink || slugifyPermlink(draft.title);

  return (
    <div className="page">
      {!enrolled && (
        <div className="banner">
          {t('compose.notEnrolled')}{' '}
          <Link to="/auth">{t('compose.enrollLink')}</Link>
        </div>
      )}
      {draft.status === 'edited_locally' && (
        <div className="banner info">{t('compose.editedLocally', { permlink })}</div>
      )}
      {uploadErr && (
        <div className="banner danger" role="alert">
          {uploadErr}
        </div>
      )}
      {publishGateErr && (
        <div className="banner danger" role="alert">
          {publishGateErr}
        </div>
      )}

      <div className="title-field">
        <label className="title-eyebrow" htmlFor="post-title">
          {t('compose.title')}
        </label>
        <input
          id="post-title"
          className="title-input"
          placeholder={t('compose.titlePlaceholder')}
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          autoComplete="off"
          spellCheck
        />
      </div>

      <div className="compose-meta">
        <span className="save-status">
          {saveStatus === 'saving'
            ? t('compose.saving')
            : saveStatus === 'failed'
              ? t('compose.saveFailed')
              : t('compose.saved')}
        </span>
        <span className="meta-dot" aria-hidden="true" />
        <span className="muted">
          {t('compose.words', {
            count: words,
            countFormatted: formatNumber(words, i18n.language),
          })}
        </span>
        <div className="compose-meta-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setMode(mode === 'preview' ? 'write' : 'preview')}
          >
            {mode === 'preview' ? t('compose.write') : t('compose.preview')}
          </button>
          <label
            className={`btn ghost${canUpload ? '' : ' disabled'}`}
            title={
              !enrolled
                ? t('compose.errUploadNeedEnroll')
                : conn === 'offline' || conn === 'rpc_unreachable'
                  ? t('compose.errUploadNetwork')
                  : undefined
            }
          >
            {t('compose.uploadImage')}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={!canUpload}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickImage(f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="btn primary" onClick={tryOpenPublish}>
            {t('compose.publish')}
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <ComposeEditor
          markdown={draft.bodyMarkdown}
          onChange={(bodyMarkdown) => patch({ bodyMarkdown })}
          mediaUsername={username}
          listRecentMedia={listRecentMedia}
          onRememberMedia={async (url, alt) => {
            if (!username) return;
            try {
              await rememberMedia({ username, url, alt });
            } catch {
              /* soft */
            }
          }}
          onUploadImage={onUploadImage}
        />
      ) : (
        <iframe ref={iframeRef} className="preview-frame" title={t('compose.previewFrameTitle')} />
      )}

      <UnlockModal
        open={unlockOpen && authMethod !== 'keychain'}
        reason={t('compose.unlockForUpload')}
        onCancel={cancelUnlock}
        onUnlocked={() => finishUnlock()}
      />
    </div>
  );
}
