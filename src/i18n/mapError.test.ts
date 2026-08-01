import { describe, expect, it } from 'vitest';
import i18n from './index';
import { localizeError } from './mapError';

describe('localizeError', () => {
  it('maps known English worker strings', () => {
    expect(localizeError('Incorrect passphrase.', i18n.t.bind(i18n))).toMatch(
      /Incorrect passphrase/i,
    );
    expect(
      localizeError('Too many failed attempts. Try again in 12s', i18n.t.bind(i18n)),
    ).toMatch(/12/);
  });

  it('passes through unknown messages', () => {
    expect(localizeError('Weird custom failure', i18n.t.bind(i18n))).toBe(
      'Weird custom failure',
    );
  });
});
