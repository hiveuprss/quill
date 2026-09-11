/** Thin wrapper around the Hive Keychain browser extension (`window.hive_keychain`). */

export type KeychainKeyType = 'Posting' | 'Active' | 'Memo';

export type KeychainResponse = {
  success: boolean;
  error?: string | null;
  message?: string;
  result?: unknown;
  publicKey?: string;
  data?: unknown;
  request_id?: number;
};

type HiveKeychainApi = {
  requestHandshake: (callback: () => void) => void;
  requestBroadcast: (
    account: string,
    operations: unknown[],
    key: KeychainKeyType,
    callback: (response: KeychainResponse) => void,
    rpc?: string | null,
  ) => void;
  requestSignBuffer: (
    account: string | null,
    message: string,
    key: KeychainKeyType,
    callback: (response: KeychainResponse) => void,
    rpc?: string | null,
    title?: string | null,
  ) => void;
};

export function getKeychain(): HiveKeychainApi | null {
  if (typeof window === 'undefined') return null;
  return (window.hive_keychain as HiveKeychainApi | undefined) ?? null;
}

export function isKeychainAvailable(): boolean {
  return !!getKeychain();
}

export function requestHandshake(): Promise<void> {
  const kc = getKeychain();
  if (!kc) return Promise.reject(new Error('Hive Keychain extension not found.'));
  return new Promise((resolve) => {
    kc.requestHandshake(() => resolve());
  });
}

function rejectKeychain(response: KeychainResponse): Error {
  const msg =
    (typeof response.error === 'string' && response.error) ||
    response.message ||
    'Hive Keychain request failed.';
  if (/cancel|rejected|user/i.test(msg)) {
    return new Error('Hive Keychain request cancelled.');
  }
  return new Error(msg);
}

export function requestBroadcast(
  account: string,
  operations: unknown[],
  key: KeychainKeyType = 'Posting',
): Promise<{ txId: string }> {
  const kc = getKeychain();
  if (!kc) return Promise.reject(new Error('Hive Keychain extension not found.'));
  return new Promise((resolve, reject) => {
    kc.requestBroadcast(account, operations, key, (response) => {
      if (!response.success) {
        reject(rejectKeychain(response));
        return;
      }
      const txId = extractTxId(response.result);
      resolve({ txId });
    });
  });
}

export function requestSignBuffer(
  account: string,
  message: string,
  key: KeychainKeyType = 'Posting',
  title?: string,
): Promise<{ signature: string; publicKey?: string }> {
  const kc = getKeychain();
  if (!kc) return Promise.reject(new Error('Hive Keychain extension not found.'));
  return new Promise((resolve, reject) => {
    kc.requestSignBuffer(
      account,
      message,
      key,
      (response) => {
        if (!response.success) {
          reject(rejectKeychain(response));
          return;
        }
        const signature =
          typeof response.result === 'string'
            ? response.result
            : response.result != null
              ? String(response.result)
              : '';
        if (!signature) {
          reject(new Error('Hive Keychain returned an empty signature.'));
          return;
        }
        resolve({
          signature,
          publicKey: typeof response.publicKey === 'string' ? response.publicKey : undefined,
        });
      },
      null,
      title ?? null,
    );
  });
}

function extractTxId(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if (typeof obj.id === 'string') return obj.id;
    if (typeof obj.tx_id === 'string') return obj.tx_id;
    if (typeof obj.txid === 'string') return obj.txid;
  }
  return result != null ? String(result) : '';
}
