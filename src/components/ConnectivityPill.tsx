import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pingHive } from '../hive/client';

export type ConnState = 'online' | 'offline' | 'checking' | 'rpc_unreachable';

export function useConnectivity(pollMs = 20000): ConnState {
  const [state, setState] = useState<ConnState>(
    navigator.onLine ? 'checking' : 'offline',
  );

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!navigator.onLine) {
        if (!cancelled) setState('offline');
        return;
      }
      if (!cancelled) setState('checking');
      const ok = await pingHive();
      if (!cancelled) setState(ok ? 'online' : 'rpc_unreachable');
    }

    const onOnline = () => void check();
    const onOffline = () => setState('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void check();
    const t = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(t);
    };
  }, [pollMs]);

  return state;
}

export function ConnectivityPill({ state }: { state: ConnState }) {
  const { t } = useTranslation();
  if (state === 'online') return null;
  const label =
    state === 'offline'
      ? t('conn.offline')
      : state === 'checking'
        ? t('conn.checking')
        : t('conn.rpcUnreachable');
  return <span className={`pill ${state}`}>{label}</span>;
}
