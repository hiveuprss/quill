import { Buffer } from 'buffer';
import { getSettings, saveSettings } from '../db/draftsDb';
import { lookupAccount } from '../hive/account';
import {
  isKeychainAvailable,
  requestBroadcast,
  requestHandshake,
  requestSignBuffer,
} from '../hive/keychain';
import { validateOps } from '../hive/ops';
import { signingClient } from './signingClient';

export type AuthMethod = 'none' | 'local' | 'keychain';

export type AuthStatus = {
  method: AuthMethod;
  enrolled: boolean;
  unlocked: boolean;
  username: string | null;
  postingPubkey: string | null;
  stale: boolean;
  keychainAvailable: boolean;
};

let keychainGestureToken: string | null = null;
let keychainLastUploadAt = 0;

async function readKeychainUsername(): Promise<string | null> {
  const s = await getSettings();
  const name = s.keychainUsername?.trim().toLowerCase();
  return name || null;
}

async function writeKeychainUsername(username: string | null): Promise<void> {
  const current = await getSettings();
  await saveSettings({
    ...current,
    keychainUsername: username || undefined,
  });
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const local = await signingClient.getStatus();
  const keychainAvailable = isKeychainAvailable();
  if (local.enrolled) {
    return {
      method: 'local',
      enrolled: true,
      unlocked: local.unlocked,
      username: local.username,
      postingPubkey: local.postingPubkey,
      stale: local.stale,
      keychainAvailable,
    };
  }
  const kcUser = await readKeychainUsername();
  if (kcUser) {
    return {
      method: 'keychain',
      enrolled: true,
      unlocked: true,
      username: kcUser,
      postingPubkey: null,
      stale: false,
      keychainAvailable,
    };
  }
  return {
    method: 'none',
    enrolled: false,
    unlocked: false,
    username: null,
    postingPubkey: null,
    stale: false,
    keychainAvailable,
  };
}

export async function enrollLocal(input: {
  username: string;
  wif: string;
  passphrase: string;
  acceptDual?: boolean;
}) {
  const kcUser = await readKeychainUsername();
  if (kcUser) {
    throw new Error(
      'Hive Keychain is already connected. Disconnect it in Settings before enrolling a local key.',
    );
  }
  return signingClient.enroll(input);
}

export async function connectKeychain(usernameRaw: string): Promise<AuthStatus> {
  const username = usernameRaw.trim().toLowerCase();
  if (!username) throw new Error('Enter a Hive username.');
  if (!isKeychainAvailable()) {
    throw new Error('Hive Keychain extension not found.');
  }
  const local = await signingClient.getStatus();
  if (local.enrolled) {
    throw new Error(
      'A local posting key is already enrolled. Wipe it in Settings before connecting Keychain.',
    );
  }
  const account = await lookupAccount(username);
  if (!account) throw new Error('Account not found.');

  await requestHandshake();
  const proof = `Quill login: @${username} at ${new Date().toISOString()}`;
  await requestSignBuffer(username, proof, 'Posting', 'Connect Quill');
  await writeKeychainUsername(username);
  return getAuthStatus();
}

export async function unlock(passphrase: string) {
  return signingClient.unlock(passphrase);
}

export async function lock() {
  const status = await getAuthStatus();
  if (status.method === 'keychain') return { ok: true };
  return signingClient.lock();
}

export async function wipeLocal() {
  return signingClient.wipe();
}

export async function disconnectKeychain() {
  keychainGestureToken = null;
  await writeKeychainUsername(null);
}

/** Wipe local vault or disconnect Keychain, depending on active method. */
export async function disconnect() {
  const status = await getAuthStatus();
  if (status.method === 'keychain') {
    await disconnectKeychain();
    return;
  }
  if (status.method === 'local') {
    await signingClient.wipe();
  }
}

export function setIdleTimeoutMin(minutes: number) {
  signingClient.setIdleTimeoutMin(minutes);
}

export async function signBroadcast(
  ops: unknown[],
  passphraseConfirm = '',
): Promise<Record<string, unknown>> {
  const status = await getAuthStatus();
  if (!status.enrolled || !status.username) {
    throw new Error('No enrolled account.');
  }
  if (status.method === 'keychain') {
    if (!isKeychainAvailable()) {
      throw new Error('Hive Keychain extension not found.');
    }
    const validated = validateOps(ops, status.username);
    const { txId } = await requestBroadcast(status.username, validated, 'Posting');
    return { ok: true, txId };
  }
  return signingClient.signBroadcast(ops, passphraseConfirm);
}

export async function armUploadGesture(): Promise<string> {
  const status = await getAuthStatus();
  if (status.method === 'keychain') {
    const token = crypto.randomUUID();
    keychainGestureToken = token;
    return token;
  }
  return signingClient.armUploadGesture();
}

export async function signUploadChallenge(
  bytes: ArrayBuffer,
  gestureToken: string,
): Promise<{ signature: string; username: string }> {
  const status = await getAuthStatus();
  if (status.method === 'keychain') {
    if (!status.username) throw new Error('No enrolled account.');
    if (!isKeychainAvailable()) {
      throw new Error('Hive Keychain extension not found.');
    }
    if (!gestureToken || gestureToken !== keychainGestureToken) {
      throw new Error('Upload must follow a user file-picker gesture.');
    }
    keychainGestureToken = null;
    const now = Date.now();
    if (now - keychainLastUploadAt < 3000) {
      throw new Error('Upload rate limited — wait a moment.');
    }
    keychainLastUploadAt = now;

    const prefix = Buffer.from('ImageSigningChallenge');
    const data = Buffer.from(bytes);
    const combined = Buffer.concat([prefix, data]);
    // Keychain expects the Node Buffer JSON shape for imagehoster signatures.
    const message = JSON.stringify(combined);
    const { signature } = await requestSignBuffer(
      status.username,
      message,
      'Posting',
      'Sign image upload',
    );
    return { signature, username: status.username };
  }
  const res = await signingClient.signUploadChallenge(bytes, gestureToken);
  return {
    signature: String(res.signature),
    username: String(res.username),
  };
}

/** Test-only: clear Keychain gesture / rate-limit state. */
export function __resetKeychainUploadStateForTests(): void {
  keychainGestureToken = null;
  keychainLastUploadAt = 0;
}
