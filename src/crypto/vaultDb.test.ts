import { beforeEach, describe, expect, it } from 'vitest';
import { loadEnvelope, saveEnvelope, wipeEnvelope, type CredentialEnvelope } from './vaultDb';

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
});
