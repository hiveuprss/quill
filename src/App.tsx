import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ConnectivityPill, useConnectivity } from './components/ConnectivityPill';
import { DraftsPage } from './pages/DraftsPage';
import { ComposePage } from './pages/ComposePage';
import { AuthPage } from './pages/AuthPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  getDraft,
  deleteDraft,
  listDrafts,
  newDraftId,
  saveDraft,
  type Draft,
} from './db/draftsDb';
import { getAuthStatus, setIdleTimeoutMin } from './crypto/authSession';
import type { AuthMethod } from './crypto/authSession';
import { getSettings } from './db/draftsDb';
import { publicAssetUrl } from './seo/siteUrl';

function ComposeRoute(props: {
  enrolled: boolean;
  unlocked: boolean;
  username: string | null;
  postingPubkey: string | null;
  authMethod: AuthMethod;
  conn: ReturnType<typeof useConnectivity>;
  onDraftSaved: (d: Draft) => void;
  onStatusChange: () => void | Promise<void>;
}) {
  const { id } = useParams();
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const { t } = useTranslation();

  useEffect(() => {
    if (!id) {
      setDraft(null);
      return;
    }
    setDraft(undefined);
    void getDraft(id).then(setDraft);
  }, [id]);

  if (draft === undefined) {
    return <div className="page muted">{t('app.loadingDraft')}</div>;
  }
  if (!draft) {
    return (
      <div className="page">
        <p className="muted">{t('app.draftNotFound')}</p>
        <Link className="btn" to="/">
          {t('app.backToDrafts')}
        </Link>
      </div>
    );
  }
  return <ComposePage draft={draft} {...props} />;
}

export default function App() {
  const { t } = useTranslation();
  const conn = useConnectivity();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [postingPubkey, setPostingPubkey] = useState<string | null>(null);
  const [vaultStale, setVaultStale] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('none');
  const navigate = useNavigate();

  const refreshStatus = useCallback(async () => {
    const s = await getAuthStatus();
    setEnrolled(s.enrolled);
    setUnlocked(s.unlocked);
    setUsername(s.username);
    setPostingPubkey(s.postingPubkey);
    setVaultStale(s.stale);
    setAuthMethod(s.method);
  }, []);

  const refreshDrafts = useCallback(async () => {
    setDrafts(await listDrafts());
  }, []);

  useEffect(() => {
    void refreshDrafts();
    void refreshStatus();
    void getSettings().then((s) => setIdleTimeoutMin(s.idleTimeoutMin));
  }, [refreshDrafts, refreshStatus]);

  async function createDraft() {
    const now = Date.now();
    const d: Draft = {
      id: newDraftId(),
      title: '',
      bodyMarkdown: '',
      tags: [],
      status: 'local',
      createdAt: now,
      updatedAt: now,
    };
    await saveDraft(d);
    await refreshDrafts();
    navigate(`/compose/${d.id}`);
  }

  async function removeDraft(id: string) {
    await deleteDraft(id);
    await refreshDrafts();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label={t('nav.brandAria')}>
          <img
            className="brand-mark"
            src={publicAssetUrl('logo.svg', import.meta.env.BASE_URL)}
            alt=""
            width={28}
            height={28}
          />
          <span className="brand-text">{t('common.quill')}</span>
        </Link>
        <ConnectivityPill state={conn} />
        <div className="topbar-spacer" />
        <Link className="btn" to="/">
          {t('nav.drafts')}
        </Link>
        <Link className="btn" to="/settings">
          {t('nav.settings')}
        </Link>
        {!enrolled && (
          <Link className="btn primary" to="/auth">
            {t('nav.enroll')}
          </Link>
        )}
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <DraftsPage
              drafts={drafts}
              onNew={() => void createDraft()}
              onDelete={removeDraft}
            />
          }
        />
        <Route
          path="/compose/:id"
          element={
            <ComposeRoute
              enrolled={enrolled}
              unlocked={unlocked}
              username={username}
              postingPubkey={postingPubkey}
              authMethod={authMethod}
              conn={conn}
              onDraftSaved={() => void refreshDrafts()}
              onStatusChange={() => void refreshStatus()}
            />
          }
        />
        <Route
          path="/auth"
          element={
            <AuthPage
              enrolled={enrolled}
              onDone={() => {
                void refreshStatus().then(() => navigate('/'));
              }}
            />
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              enrolled={enrolled}
              username={username}
              postingPubkey={postingPubkey}
              vaultStale={vaultStale}
              authMethod={authMethod}
              onStatusChange={() => void refreshStatus()}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
