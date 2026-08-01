/** Locale-aware display helpers (Intl). */

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDateTime(
  ts: number,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(new Date(ts));
}

const RELATIVE_DIVISIONS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 60 * 60 * 24 * 365 },
  { unit: 'month', seconds: 60 * 60 * 24 * 30 },
  { unit: 'week', seconds: 60 * 60 * 24 * 7 },
  { unit: 'day', seconds: 60 * 60 * 24 },
  { unit: 'hour', seconds: 60 * 60 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
];

/** Human-relative time (“3 hours ago” / “hace 3 horas”). */
export function formatRelativeTime(ts: number, locale: string, now: number = Date.now()): string {
  const diffSec = Math.round((ts - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const { unit, seconds } of RELATIVE_DIVISIONS) {
    if (abs >= seconds || unit === 'second') {
      const value = Math.round(diffSec / seconds);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(0, 'second');
}
