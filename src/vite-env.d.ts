/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface HiveKeychainResponse {
  success: boolean;
  error?: string | null;
  message?: string;
  result?: unknown;
  publicKey?: string;
  data?: unknown;
  request_id?: number;
}

interface HiveKeychainApi {
  requestHandshake: (callback: () => void) => void;
  requestBroadcast: (
    account: string,
    operations: unknown[],
    key: 'Posting' | 'Active' | 'Memo',
    callback: (response: HiveKeychainResponse) => void,
    rpc?: string | null,
  ) => void;
  requestSignBuffer: (
    account: string | null,
    message: string,
    key: 'Posting' | 'Active' | 'Memo',
    callback: (response: HiveKeychainResponse) => void,
    rpc?: string | null,
    title?: string | null,
  ) => void;
}

interface Window {
  hive_keychain?: HiveKeychainApi;
}
