import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Draft } from '../db/draftsDb';
import { slugifyPermlink } from '../db/draftsDb';
import { buildRootPostOps, peakdUrl } from '../hive/ops';
import { signingClient } from '../crypto/signingClient';
import { pingHive } from '../hive/client';
import { verifyRotation } from '../hive/account';
import { localizeError } from '../i18n/mapError';
import { checkPublishContent } from '../publish/gates';
import type { ConnState } from './ConnectivityPill';

type Phase =
  | 'idle'
  | 'preflight'
  | 'passphrase'
  | 'broadcasting'
  | 'success'
  | 'error';

type Props = {
  draft: Draft;
  conn: ConnState;
  enrolled: boolean;
  unlocked: boolean;
  username: string | null;
  postingPubkey: string | null;
  onUpdateDraft: (patch: Partial<Draft>) => void;
  onNeedEnroll: () => void;
  onPublished: (draft: Draft, url: string) => void;
  onCancel: () => void;
};

export function PublishSheet({
  draft,
  conn,
  enrolled,
  unlocked,
  username,
  postingPubkey,
  onUpdateDraft,
  onNeedEnroll,
  onPublished,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  const permlink = draft.permlink || slugifyPermlink(draft.title || 'untitled');
  const tags = draft.tags.length ? draft.tags : ['blog'];

  const dryRun = useMemo(() => {
    const none = t('publish.dryNone');
    return [
      `${t('publish.dryTitle')}: ${draft.title}`,
      `${t('publish.dryPermlink')}: ${permlink}`,
      `${t('publish.dryTags')}: ${tags.join(', ')}`,
      `${t('publish.dryCommunity')}: ${draft.community || none}`,
      `${t('publish.dryDescription')}: ${draft.description || none}`,
      `${t('publish.dryCover')}: ${draft.coverImageUrl || none}`,
      `${t('publish.dryMode')}: ${
        draft.status === 'edited_locally' || draft.status === 'published'
          ? t('publish.dryModeUpdate')
          : t('publish.dryModeNew')
      }`,
      `${t('publish.dryBodyChars')}: ${draft.bodyMarkdown.length}`,
    ].join('\n');
  }, [draft, permlink, tags, t]);

  const contentGate = checkPublishContent(draft);
  const contentGateReason = !contentGate.ok
    ? contentGate.code === 'empty_title'
      ? t('publish.disabledTitle')
      : t('publish.disabledBodyShort', {
          min: contentGate.minBody,
          count: contentGate.bodyLen,
        })
    : null;

  const disabledReason =
    conn === 'offline'
      ? t('publish.disabledOffline')
      : conn === 'rpc_unreachable'
        ? t('publish.disabledRpc')
        : conn === 'checking'
          ? t('publish.disabledChecking')
          : !enrolled
            ? t('publish.disabledEnroll')
            : contentGateReason;

  async function startPublish() {
    setError(null);
    setWarn(null);
    if (!enrolled) {
      onNeedEnroll();
      return;
    }
    if (phase !== 'idle' && phase !== 'error') return;
    const gate = checkPublishContent(draft);
    if (!gate.ok) {
      setError(
        gate.code === 'empty_title'
          ? t('publish.disabledTitle')
          : t('publish.disabledBodyShort', { min: gate.minBody, count: gate.bodyLen }),
      );
      return;
    }
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    const community = draft.community?.trim();
    if (community && !/^hive-\d+$/i.test(community)) {
      setError(t('publish.errCommunity'));
      return;
    }
    const cover = draft.coverImageUrl?.trim();
    if (cover && !/^https:\/\//i.test(cover)) {
      setError(t('publish.errCoverHttps'));
      return;
    }
    setPhase('preflight');
    const ok = await pingHive();
    if (!ok) {
      setPhase('error');
      setError(t('publish.errRpc'));
      return;
    }
    if (username && postingPubkey) {
      const rot = await verifyRotation(username, postingPubkey);
      if (rot === 'disagree') {
        setPhase('error');
        setError(t('publish.errNodesDisagree'));
        return;
      }
      if (rot === 'mismatch') {
        setPhase('error');
        setError(t('publish.errKeyRotated'));
        return;
      }
    }
    if (!unlocked) {
      setWarn(t('publish.warnLocked'));
    }
    setPhase('passphrase');
  }

  async function confirmPublish() {
    if (phase !== 'passphrase') return;
    if (!username) {
      setError(t('publish.errNotEnrolled'));
      return;
    }
    setPhase('broadcasting');
    setError(null);
    try {
      const isUpdate =
        draft.status === 'edited_locally' ||
        draft.status === 'published' ||
        !!draft.publishedPermlink;
      const ops = buildRootPostOps({
        author: username,
        title: draft.title,
        body: draft.bodyMarkdown,
        permlink,
        tags,
        community: draft.community,
        description: draft.description,
        coverImageUrl: draft.coverImageUrl,
        isUpdate,
      });
      const res = await signingClient.signBroadcast(ops, passphrase);
      if (res.reauth_required) {
        setPhase('error');
        setError(
          localizeError(String(res.message || t('publish.errReenroll')), t),
        );
        setPassphrase('');
        return;
      }
      const id = String(res.txId || '');
      setTxId(id);
      const url = peakdUrl(username, permlink);
      setSuccessUrl(url);
      setPhase('success');
      setPassphrase('');
      onPublished(
        {
          ...draft,
          permlink,
          tags,
          status: 'published',
          publishedAt: Date.now(),
          publishedPermlink: permlink,
          updatedAt: Date.now(),
        },
        url,
      );
    } catch (err) {
      setPhase('error');
      setError(localizeError(err instanceof Error ? err.message : String(err), t));
      setPassphrase('');
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">{t('publish.title')}</h1>
      {!enrolled && (
        <div className="banner">
          {t('publish.notEnrolled')}{' '}
          <button type="button" className="btn" onClick={onNeedEnroll}>
            {t('publish.enroll')}
          </button>
        </div>
      )}
      {(draft.status === 'edited_locally' || draft.status === 'published') && (
        <div className="banner info">{t('publish.updateBanner')}</div>
      )}

      <div className="form-stack">
        <label>
          {t('publish.tags')}
          <input
            value={draft.tags.join(', ')}
            onChange={(e) =>
              onUpdateDraft({
                tags: e.target.value
                  .split(',')
                  .map((tag) => tag.trim().toLowerCase())
                  .filter(Boolean)
                  .slice(0, 8),
              })
            }
          />
        </label>
        <label>
          {t('publish.community')}
          <input
            value={draft.community || ''}
            onChange={(e) => onUpdateDraft({ community: e.target.value.trim() })}
            placeholder={t('publish.communityPlaceholder')}
          />
        </label>
        <label>
          {t('publish.description')}
          <textarea
            rows={2}
            value={draft.description || ''}
            onChange={(e) => onUpdateDraft({ description: e.target.value })}
          />
        </label>
        <label>
          {t('publish.cover')}
          <input
            value={draft.coverImageUrl || ''}
            onChange={(e) => onUpdateDraft({ coverImageUrl: e.target.value })}
            placeholder={t('publish.coverPlaceholder')}
          />
        </label>
        <label>
          {t('publish.permlink')}
          <input
            value={permlink}
            onChange={(e) =>
              onUpdateDraft({
                permlink: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
              })
            }
          />
        </label>
      </div>

      <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', marginTop: '1.5rem' }}>
        {t('publish.dryRun')}
      </h2>
      <div className="dry-run">{dryRun}</div>

      {warn && (
        <div className="banner" role="status">
          {warn}
        </div>
      )}
      {error && (
        <div className="banner danger" role="alert">
          {error}
        </div>
      )}

      {phase === 'passphrase' && (
        <label className="form-stack publish-passphrase">
          {t('publish.passphrase')}
          <input
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
      )}

      {phase === 'success' && successUrl && (
        <div className="banner info" role="status">
          {t('publish.published')}
          {txId ? ` · tx ${txId}` : ''}.{' '}
          <a href={successUrl} target="_blank" rel="noopener noreferrer">
            {t('publish.openPeakd')}
          </a>
        </div>
      )}

      <div className="row-actions">
        <button
          type="button"
          className="btn"
          disabled={phase === 'broadcasting' || phase === 'preflight'}
          onClick={onCancel}
        >
          {phase === 'success' ? t('publish.done') : t('publish.cancel')}
        </button>
        {phase !== 'passphrase' && phase !== 'success' && phase !== 'broadcasting' && (
          <button
            type="button"
            className="btn primary"
            disabled={!!disabledReason || phase === 'preflight'}
            onClick={() => void startPublish()}
          >
            {phase === 'preflight' ? t('publish.checking') : disabledReason || t('publish.continue')}
          </button>
        )}
        {phase === 'passphrase' && (
          <button
            type="button"
            className="btn primary"
            disabled={!passphrase}
            onClick={() => void confirmPublish()}
          >
            {t('publish.confirm')}
          </button>
        )}
        {phase === 'broadcasting' && (
          <button type="button" className="btn primary" disabled>
            {t('publish.broadcasting')}
          </button>
        )}
      </div>
    </div>
  );
}
