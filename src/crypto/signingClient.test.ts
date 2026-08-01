import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = ((ev: MessageEvent) => void) | null;

class MockWorker {
  onmessage: Handler = null;
  onerror: ((err: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((msg: Record<string, unknown>) => {
    queueMicrotask(() => {
      const type = msg.type;
      let data: Record<string, unknown> = { id: msg.id, ok: true };
      if (type === 'getStatus') {
        data = { id: msg.id, ok: true, enrolled: false, unlocked: false, username: null, postingPubkey: null };
      } else if (type === 'enroll') {
        data = { id: msg.id, ok: true, username: msg.username };
      } else if (type === 'unlock') {
        data = { id: msg.id, ok: true, unlocked: true };
      } else if (type === 'lock') {
        data = { id: msg.id, ok: true, unlocked: false };
      } else if (type === 'armGesture') {
        data = { id: msg.id, ok: true };
      } else if (type === 'signBroadcast' && msg.passphraseConfirm === 'bad') {
        data = { id: msg.id, ok: false, error: 'Incorrect passphrase.' };
      } else if (type === 'signBroadcast') {
        data = { id: msg.id, ok: true, txId: 'tx1' };
      }
      this.onmessage?.({ data } as MessageEvent);
    });
  });
}

vi.mock('./signingWorker?worker', () => ({
  default: MockWorker,
}));

describe('signingClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  it('getStatus / enroll / unlock / lock round-trip via worker', async () => {
    const { signingClient } = await import('./signingClient');
    const status = await signingClient.getStatus();
    expect(status.enrolled).toBe(false);

    const enrolled = await signingClient.enroll({
      username: 'alice',
      wif: '5K',
      passphrase: 'passphrase-12',
    });
    expect(enrolled.username).toBe('alice');

    await signingClient.unlock('passphrase-12');
    await signingClient.lock();
    const token = await signingClient.armUploadGesture();
    expect(token).toMatch(/./);
  });

  it('rejects worker errors', async () => {
    const { signingClient } = await import('./signingClient');
    await expect(signingClient.signBroadcast([], 'bad')).rejects.toThrow(/Incorrect/i);
  });

  it('idle timeout triggers lock', async () => {
    const { signingClient } = await import('./signingClient');
    signingClient.setIdleTimeoutMin(5);
    await signingClient.unlock('x');
    const lockSpy = vi.spyOn(signingClient, 'lock');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10);
    expect(lockSpy).toHaveBeenCalled();
  });
});
