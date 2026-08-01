import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkPostingAuthority,
  getRcWarning,
  lookupAccount,
  verifyRotation,
} from './account';
import { jsonRpcOk, makeTestPostingKey, mockAccount } from '../test/mocks/hiveRpc';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account', () => {
  let pub: string;

  beforeEach(() => {
    pub = makeTestPostingKey().pub;
  });

  it('checkPostingAuthority accepts posting-only key', () => {
    const account = mockAccount('alice', pub);
    const res = checkPostingAuthority(account, pub);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.dualAuthority).toBe(false);
      expect(res.username).toBe('alice');
    }
  });

  it('checkPostingAuthority flags dual authority', () => {
    const account = mockAccount('alice', pub, { dual: true });
    const res = checkPostingAuthority(account, pub);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dualAuthority).toBe(true);
  });

  it('checkPostingAuthority rejects unknown key', () => {
    const account = mockAccount('alice', pub);
    const res = checkPostingAuthority(account, 'STM_NOT_PRESENT');
    expect(res.ok).toBe(false);
  });

  it('lookupAccount returns account or null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRpcOk([mockAccount('bob', pub)])));
    await expect(lookupAccount('bob')).resolves.toMatchObject({ name: 'bob' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRpcOk([])));
    await expect(lookupAccount('nobody')).resolves.toBeNull();
  });

  it('getRcWarning is soft placeholder', async () => {
    await expect(getRcWarning('alice')).resolves.toBeNull();
  });

  it('verifyRotation match / mismatch / fail', async () => {
    const acct = [mockAccount('bob', pub)];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonRpcOk(acct)).mockResolvedValueOnce(jsonRpcOk(acct)),
    );
    await expect(verifyRotation('bob', pub)).resolves.toBe('match');

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonRpcOk([mockAccount('bob', 'STMOTHER')]))
        .mockResolvedValueOnce(jsonRpcOk([mockAccount('bob', 'STMOTHER')])),
    );
    await expect(verifyRotation('bob', pub)).resolves.toBe('mismatch');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(verifyRotation('bob', pub)).resolves.toBe('fail');
  });
});
