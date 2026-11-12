import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isKeychainAvailable,
  requestBroadcast,
  requestHandshake,
  requestSignBuffer,
} from './keychain';

describe('hive/keychain', () => {
  beforeEach(() => {
    delete (window as { hive_keychain?: unknown }).hive_keychain;
  });

  it('detects missing extension', () => {
    expect(isKeychainAvailable()).toBe(false);
  });

  it('handshakes when available', async () => {
    window.hive_keychain = {
      requestHandshake: (cb) => cb(),
      requestBroadcast: vi.fn(),
      requestSignBuffer: vi.fn(),
    };
    await expect(requestHandshake()).resolves.toBeUndefined();
  });

  it('broadcasts and extracts tx id', async () => {
    window.hive_keychain = {
      requestHandshake: vi.fn(),
      requestBroadcast: (_a, _ops, _k, cb) => cb({ success: true, result: { id: 'abc' } }),
      requestSignBuffer: vi.fn(),
    };
    await expect(requestBroadcast('alice', [['comment', {}]], 'Posting')).resolves.toEqual({
      txId: 'abc',
    });
  });

  it('maps cancelled broadcast errors', async () => {
    window.hive_keychain = {
      requestHandshake: vi.fn(),
      requestBroadcast: (_a, _ops, _k, cb) =>
        cb({ success: false, error: 'user canceled the request' }),
      requestSignBuffer: vi.fn(),
    };
    await expect(requestBroadcast('alice', [], 'Posting')).rejects.toThrow(/cancelled/i);
  });

  it('returns sign buffer signature', async () => {
    window.hive_keychain = {
      requestHandshake: vi.fn(),
      requestBroadcast: vi.fn(),
      requestSignBuffer: (_a, _m, _k, cb) =>
        cb({ success: true, result: 'SIG', publicKey: 'STM1' }),
    };
    await expect(requestSignBuffer('alice', 'hello', 'Posting')).resolves.toEqual({
      signature: 'SIG',
      publicKey: 'STM1',
    });
  });
});
