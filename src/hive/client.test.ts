import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccountsMulti, pingHive, rpcCall } from './client';
import { jsonRpcOk } from '../test/mocks/hiveRpc';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hive client', () => {
  it('rpcCall returns first successful node', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRpcOk({ head_block_number: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await rpcCall('condenser_api.get_dynamic_global_properties', []);
    expect(result).toEqual({ head_block_number: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails over when first node errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(jsonRpcOk({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await rpcCall('condenser_api.get_dynamic_global_properties', [], [
      'https://api.hive.blog',
      'https://api.deathwing.me',
    ]);
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out hung nodes and tries next', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    // Second call succeeds immediately
    fetchMock
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      )
      .mockResolvedValueOnce(jsonRpcOk({ rescued: true }));

    vi.stubGlobal('fetch', fetchMock);
    const pending = rpcCall('condenser_api.get_dynamic_global_properties', [], [
      'https://api.hive.blog',
      'https://api.deathwing.me',
    ]);
    await vi.advanceTimersByTimeAsync(8_100);
    await expect(pending).resolves.toEqual({ rescued: true });
    vi.useRealTimers();
  });

  it('pingHive false when all nodes fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('nope')));
    await expect(pingHive()).resolves.toBe(false);
  });

  it('getAccountsMulti detects disagreement', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRpcOk([{ name: 'a', posting: { key_auths: [['STM1', 1]] } }]),
      )
      .mockResolvedValueOnce(
        jsonRpcOk([{ name: 'a', posting: { key_auths: [['STM2', 1]] } }]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await getAccountsMulti('a');
    expect(res.agreement).toBe('disagree');
  });

  it('getAccountsMulti agrees when keys match', async () => {
    const acct = [{ name: 'a', posting: { key_auths: [['STM1', 1]] } }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonRpcOk(acct)).mockResolvedValueOnce(jsonRpcOk(acct)),
    );
    const res = await getAccountsMulti('a');
    expect(res.agreement).toBe('ok');
    expect(res.accounts).toHaveLength(1);
  });
});
