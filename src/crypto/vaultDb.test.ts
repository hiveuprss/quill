import { beforeEach, describe, expect, it } from 'vitest';
import { loadEnvelope, saveEnvelope, wipeEnvelope, markEnvelopeStale, type CredentialEnvelope } from './vaultDb';

const envelope: CredentialEnvelope = {
  v: 1,
  username: 'alice',
  postingPubkey: 'STMTEST',
  salt: 'c2FsdA==',
  iv: 'aXY=',
  ciphertext: 'Y3Q=',
  kdf: { name: 'pbkdf2', hash: 'SHA-256', iterations: 600_000 },
  createdAt: 1,
};

describe('vaultDb', () => {
  beforeEach(async () => {
    await wipeEnvelope();
  });

  it('save/load/wipe envelope', async () => {
    expect(await loadEnvelope()).toBeNull();
    await saveEnvelope(envelope);
    expect(await loadEnvelope()).toEqual(envelope);
    await wipeEnvelope();
    expect(await loadEnvelope()).toBeNull();
  });

  it('markEnvelopeStale keeps ciphertext', async () => {
    await saveEnvelope(envelope);
    await markEnvelopeStale('rotated');
    const loaded = await loadEnvelope();
    expect(loaded?.stale).toBe(true);
    expect(loaded?.staleReason).toBe('rotated');
    expect(loaded?.ciphertext).toBe(envelope.ciphertext);
  });
});
