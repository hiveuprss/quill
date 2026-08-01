import { describe, expect, it } from 'vitest';
import {
  base64ToBuf,
  bufToBase64,
  deriveAesKey,
  randomBytes,
} from './kdf';

describe('kdf', () => {
  it('buf/base64 round-trip', () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    expect(Array.from(base64ToBuf(bufToBase64(bytes)))).toEqual([1, 2, 3, 250]);
  });

  it('randomBytes length', () => {
    expect(randomBytes(12)).toHaveLength(12);
  });

  it('deriveAesKey encrypt/decrypt round-trip', async () => {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveAesKey('test-passphrase-12', salt);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode('secret-wif'),
    );
    const key2 = await deriveAesKey('test-passphrase-12', salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, ct);
    expect(new TextDecoder().decode(pt)).toBe('secret-wif');
  }, 30_000);
});
