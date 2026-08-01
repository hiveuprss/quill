import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime, formatNumber, formatRelativeTime } from './format';

describe('format helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats numbers per locale', () => {
    expect(formatNumber(1234, 'en')).toMatch(/1,234|1234/);
    expect(formatNumber(1234, 'es')).toMatch(/1.234|1234|1[\u00a0 ]234/);
  });

  it('formats absolute datetimes', () => {
    const ts = Date.UTC(2026, 0, 15, 12, 30);
    const en = formatDateTime(ts, 'en', { timeZone: 'UTC' });
    expect(en).toMatch(/2026|Jan|15/);
  });

  it('formats relative times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T18:00:00Z'));
    const threeHoursAgo = Date.parse('2026-08-01T15:00:00Z');
    expect(formatRelativeTime(threeHoursAgo, 'en')).toMatch(/3 hours ago|hours ago/i);
    expect(formatRelativeTime(threeHoursAgo, 'es')).toMatch(/hace|hora/i);
  });
});
