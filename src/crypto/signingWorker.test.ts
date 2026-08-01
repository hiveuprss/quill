/** @vitest-environment node */
import { Buffer } from 'node:buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { wipeEnvelope } from './vaultDb';
import {
  __resetWorkerStateForTests,
  __setClientFactoryForTests,
  __setMessageSinkForTests,
  handleWorkerMessage,
} from './signingWorker';
import { makeTestPostingKey, mockAccount } from '../test/mocks/hiveRpc';
import { buildRootPostOps } from '../hive/ops';

describe('signingWorker', () => {
  const pass = 'StrongPassphrase!1';
  let key: ReturnType<typeof makeTestPostingKey>;
  const getAccounts = vi.fn();
  const sendOperations = vi.fn();

  beforeEach(async () => {
    key = makeTestPostingKey('worker-enroll-seed');
    __resetWorkerStateForTests();
    await wipeEnvelope();
    getAccounts.mockReset();
    sendOperations.mockReset();
    __setClientFactoryForTests(() => ({
      database: { getAccounts },
      broadcast: { sendOperations },
    }));
  });

  function collect() {
    const messages: Record<string, unknown>[] = [];
    __setMessageSinkForTests((data) => messages.push(data));
    return messages;
  }

  it('rejects invalid WIF', async () => {
    const messages = collect();
    await handleWorkerMessage({
      id: '1',
      type: 'enroll',
      username: 'alice',
      wif: 'not-a-wif',
      passphrase: pass,
    });
    expect(messages[0]).toMatchObject({ ok: false, error: expect.stringMatching(/Invalid/i) });
  });

  it('rejects missing account', async () => {
    getAccounts.mockResolvedValue([]);
    const messages = collect();
    await handleWorkerMessage({
      id: '1',
      type: 'enroll',
      username: 'nobody',
      wif: key.wif,
      passphrase: pass,
    });
    expect(messages[0]).toMatchObject({ ok: false, error: expect.stringMatching(/not found/i) });
  });

  it('rejects key not on posting authority', async () => {
    const other = makeTestPostingKey('other-key').pub;
    getAccounts.mockResolvedValue([mockAccount('alice', other)]);
    const messages = collect();
    await handleWorkerMessage({
      id: '1',
      type: 'enroll',
      username: 'alice',
      wif: key.wif,
      passphrase: pass,
    });
    expect(messages[0]).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not a posting authority/i),
    });
  });

  it('requires dual-authority confirmation', async () => {
    getAccounts.mockResolvedValue([mockAccount('alice', key.pub, { dual: true })]);
    const messages = collect();
    await handleWorkerMessage({
      id: '1',
      type: 'enroll',
      username: 'alice',
      wif: key.wif,
      passphrase: pass,
    });
    expect(messages[0]).toMatchObject({ ok: false, needsDualConfirm: true });
  });

  it('enrolls, unlocks, locks, wipes', async () => {
    getAccounts.mockResolvedValue([mockAccount('alice', key.pub)]);
    const messages = collect();

    await handleWorkerMessage({
      id: 'e',
      type: 'enroll',
      username: 'alice',
      wif: key.wif,
      passphrase: pass,
      acceptDual: false,
    });
    expect(messages.at(-1)).toMatchObject({ ok: true, username: 'alice' });

    await handleWorkerMessage({ id: 's', type: 'getStatus' });
    expect(messages.at(-1)).toMatchObject({ enrolled: true, unlocked: true });

    await handleWorkerMessage({ id: 'l', type: 'lock' });
    expect(messages.at(-1)).toMatchObject({ unlocked: false });

    await handleWorkerMessage({ id: 'u', type: 'unlock', passphrase: pass });
    expect(messages.at(-1)).toMatchObject({ ok: true, unlocked: true });

    await handleWorkerMessage({ id: 'bad', type: 'unlock', passphrase: 'wrong-password!!' });
    expect(messages.at(-1)).toMatchObject({ ok: false, error: expect.stringMatching(/Incorrect/i) });

    await handleWorkerMessage({ id: 'w', type: 'wipe' });
    await handleWorkerMessage({ id: 's2', type: 'getStatus' });
    expect(messages.at(-1)).toMatchObject({ enrolled: false });
  }, 60_000);

  it('rejects non-allowlisted broadcast ops', async () => {
    getAccounts.mockResolvedValue([mockAccount('alice', key.pub)]);
    const messages = collect();
    await handleWorkerMessage({
      id: 'e',
      type: 'enroll',
      username: 'alice',
      wif: key.wif,
      passphrase: pass,
    });
    await handleWorkerMessage({
      id: 'b',
      type: 'signBroadcast',
      ops: [['transfer', {}]],
      passphraseConfirm: pass,
    });
    expect(messages.at(-1)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Only comment/i),
    });
  }, 60_000);

  it('broadcasts allowlisted ops when rotation matches', async () => {
    getAccounts.mockResolvedValue([mockAccount('alice', key.pub)]);
    sendOperations.mockResolvedValue({ id: 'txid123' });
    const messages = collect();
    await handleWorkerMessage({
      id: 'e',
      type: 'enroll',
      username: 'alice',
      wif: key.wif,
      passphrase: pass,
    });
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'T',
      body: 'B',
      permlink: 't',
      tags: ['blog'],
    });
    await handleWorkerMessage({
      id: 'b',
      type: 'signBroadcast',
      ops,
      passphraseConfirm: pass,
    });
    expect(messages.at(-1)).toMatchObject({ ok: true, txId: 'txid123' });
    expect(sendOperations).toHaveBeenCalled();
  }, 60_000);

  it('gesture-gates upload signing', async () => {
    getAccounts.mockResolvedValue([mockAccount('alice', key.pub)]);
    const messages = collect();
    await handleWorkerMessage({
      id: 'e',
      type: 'enroll',
      username: 'alice',
      wif: key.wif,
      passphrase: pass,
    });
    await handleWorkerMessage({
      id: 'u1',
      type: 'signUploadChallenge',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      gestureToken: 'nope',
    });
    expect(messages.at(-1)).toMatchObject({ ok: false, error: expect.stringMatching(/gesture/i) });

    await handleWorkerMessage({ id: 'g', type: 'armGesture', token: 'tok-1' });
    await handleWorkerMessage({
      id: 'u2',
      type: 'signUploadChallenge',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      gestureToken: 'tok-1',
    });
    expect(messages.at(-1)).toMatchObject({ ok: true, signature: expect.any(String) });
  }, 60_000);
});
