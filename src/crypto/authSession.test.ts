import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';

const getStatus = vi.fn();
const enroll = vi.fn();
const unlockLocal = vi.fn();
const lockLocal = vi.fn();
const wipe = vi.fn();
const signBroadcastLocal = vi.fn();
const armUploadGestureLocal = vi.fn();
const signUploadChallengeLocal = vi.fn();
const setIdleTimeoutMinLocal = vi.fn();

const lookupAccount = vi.fn();
const isKeychainAvailable = vi.fn();
const requestHandshake = vi.fn();
const requestBroadcast = vi.fn();
const requestSignBuffer = vi.fn();

vi.mock('./signingClient', () => ({
  signingClient: {
    getStatus: (...a: unknown[]) => getStatus(...a),
    enroll: (...a: unknown[]) => enroll(...a),
    unlock: (...a: unknown[]) => unlockLocal(...a),
    lock: (...a: unknown[]) => lockLocal(...a),
    wipe: (...a: unknown[]) => wipe(...a),
    signBroadcast: (...a: unknown[]) => signBroadcastLocal(...a),
    armUploadGesture: (...a: unknown[]) => armUploadGestureLocal(...a),
    signUploadChallenge: (...a: unknown[]) => signUploadChallengeLocal(...a),
    setIdleTimeoutMin: (...a: unknown[]) => setIdleTimeoutMinLocal(...a),
  },
}));

vi.mock('../hive/account', () => ({
  lookupAccount: (...a: unknown[]) => lookupAccount(...a),
}));

vi.mock('../hive/keychain', () => ({
  isKeychainAvailable: () => isKeychainAvailable(),
  requestHandshake: (...a: unknown[]) => requestHandshake(...a),
  requestBroadcast: (...a: unknown[]) => requestBroadcast(...a),
  requestSignBuffer: (...a: unknown[]) => requestSignBuffer(...a),
}));

describe('authSession', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { draftsDb, saveSettings } = await import('../db/draftsDb');
    await draftsDb.settings.clear();
    await saveSettings({ key: 'app', idleTimeoutMin: 10, locale: 'system', theme: 'light' });
    getStatus.mockReset().mockResolvedValue({
      enrolled: false,
      unlocked: false,
      username: null,
      postingPubkey: null,
      stale: false,
    });
    enroll.mockReset();
    unlockLocal.mockReset();
    lockLocal.mockReset();
    wipe.mockReset();
    signBroadcastLocal.mockReset();
    armUploadGestureLocal.mockReset();
    signUploadChallengeLocal.mockReset();
    lookupAccount.mockReset();
    isKeychainAvailable.mockReset().mockReturnValue(true);
    requestHandshake.mockReset().mockResolvedValue(undefined);
    requestBroadcast.mockReset();
    requestSignBuffer.mockReset();
    const { __resetKeychainUploadStateForTests } = await import('./authSession');
    __resetKeychainUploadStateForTests();
  });

  it('reports keychain method when username saved and no local vault', async () => {
    const { saveSettings } = await import('../db/draftsDb');
    await saveSettings({
      key: 'app',
      idleTimeoutMin: 10,
      locale: 'system',
      theme: 'light',
      keychainUsername: 'alice',
    });
    const { getAuthStatus } = await import('./authSession');
    const status = await getAuthStatus();
    expect(status).toMatchObject({
      method: 'keychain',
      enrolled: true,
      unlocked: true,
      username: 'alice',
    });
  });

  it('prefers local vault over keychain username', async () => {
    const { saveSettings } = await import('../db/draftsDb');
    await saveSettings({
      key: 'app',
      idleTimeoutMin: 10,
      locale: 'system',
      theme: 'light',
      keychainUsername: 'alice',
    });
    getStatus.mockResolvedValue({
      enrolled: true,
      unlocked: false,
      username: 'bob',
      postingPubkey: 'STM1',
      stale: false,
    });
    const { getAuthStatus } = await import('./authSession');
    const status = await getAuthStatus();
    expect(status.method).toBe('local');
    expect(status.username).toBe('bob');
  });

  it('connectKeychain stores username after handshake + proof', async () => {
    lookupAccount.mockResolvedValue({ name: 'alice' });
    requestSignBuffer.mockResolvedValue({ signature: 'sig' });
    const { connectKeychain, getAuthStatus } = await import('./authSession');
    await connectKeychain('Alice');
    expect(requestHandshake).toHaveBeenCalled();
    expect(requestSignBuffer).toHaveBeenCalled();
    const status = await getAuthStatus();
    expect(status.method).toBe('keychain');
    expect(status.username).toBe('alice');
  });

  it('signBroadcast uses Keychain with validated ops', async () => {
    const { saveSettings } = await import('../db/draftsDb');
    await saveSettings({
      key: 'app',
      idleTimeoutMin: 10,
      locale: 'system',
      theme: 'light',
      keychainUsername: 'alice',
    });
    requestBroadcast.mockResolvedValue({ txId: 'txid1' });
    const { buildRootPostOps } = await import('../hive/ops');
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'Hi',
      body: 'x'.repeat(200),
      permlink: 'hi',
      tags: ['blog'],
    });
    const { signBroadcast } = await import('./authSession');
    const res = await signBroadcast(ops);
    expect(requestBroadcast).toHaveBeenCalledWith('alice', ops, 'Posting');
    expect(res).toEqual({ ok: true, txId: 'txid1' });
    expect(signBroadcastLocal).not.toHaveBeenCalled();
  });

  it('signUploadChallenge asks Keychain to sign ImageSigningChallenge buffer JSON', async () => {
    const { saveSettings } = await import('../db/draftsDb');
    await saveSettings({
      key: 'app',
      idleTimeoutMin: 10,
      locale: 'system',
      theme: 'light',
      keychainUsername: 'alice',
    });
    requestSignBuffer.mockResolvedValue({ signature: 'imgsig' });
    const { armUploadGesture, signUploadChallenge } = await import('./authSession');
    const token = await armUploadGesture();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const res = await signUploadChallenge(bytes, token);
    expect(res).toEqual({ signature: 'imgsig', username: 'alice' });
    const message = requestSignBuffer.mock.calls[0][1] as string;
    const parsed = JSON.parse(message) as { type: string; data: number[] };
    expect(parsed.type).toBe('Buffer');
    const reconstructed = Buffer.from(parsed.data);
    expect(reconstructed.subarray(0, 'ImageSigningChallenge'.length).toString()).toBe(
      'ImageSigningChallenge',
    );
  });

  it('refuses connectKeychain when local vault enrolled', async () => {
    getStatus.mockResolvedValue({
      enrolled: true,
      unlocked: true,
      username: 'bob',
      postingPubkey: 'STM1',
      stale: false,
    });
    const { connectKeychain } = await import('./authSession');
    await expect(connectKeychain('alice')).rejects.toThrow(/local posting key/i);
  });
});
