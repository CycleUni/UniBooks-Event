/**
 * Pure helpers for event calendar dates (single day, range, and ended state).
 * Used by both server API and page scripts.
 */

/** The IANA time zone for a region: TW -> Asia/Taipei, HK -> Asia/Hong_Kong, default Asia/Taipei. */
export function regionTimeZone(regionCode?: string | null): string {
  const code = regionCode?.toUpperCase();
  if (code === 'HK') return 'Asia/Hong_Kong';
  return 'Asia/Taipei';
}

/** Calendar date YYYY-MM-DD for today in the given time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/**
 * Whether a string is a real calendar date in YYYY-MM-DD format (rejects e.g. 2026-02-31).
 */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * An event has ended when it has an endDate and today's calendar date in the
 * event region's time zone is strictly after endDate (still live throughout its last day).
 */
export function hasEnded(
  event: { endDate?: string | null; regionCode?: string | null },
  now: Date = new Date(),
): boolean {
  if (!event.endDate) return false;
  const tz = regionTimeZone(event.regionCode);
  const today = todayIn(tz, now);
  return today > event.endDate;
}

/**
 * Format a calendar date string (YYYY-MM-DD) with the page's locale.
 * TimeZone is UTC so the calendar day never shifts.
 */
export function formatDate(dateStr: string, locale?: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(d);
}

/**
 * Format single day (one date) or range (start – end).
 * If neither date is set, returns an empty string.
 */
export function formatEventDates(
  startDate?: string | null,
  endDate?: string | null,
  locale?: string,
): string {
  if (!startDate && !endDate) return '';
  if (startDate && (!endDate || startDate === endDate)) {
    return formatDate(startDate, locale);
  }
  if (startDate && endDate) {
    return `${formatDate(startDate, locale)} \u2013 ${formatDate(endDate, locale)}`;
  }
  if (endDate) {
    return formatDate(endDate, locale);
  }
  return '';
}
