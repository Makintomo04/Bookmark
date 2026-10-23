// Time zone handling for calendar-day features (reading streaks).
//
// Which zone is "the reader's": User.timeZone when stored. The browser reports its IANA zone in
// the TIME_ZONE_COOKIE cookie, and server code saves it to User.timeZone when it changes (see
// lib/achievements.ts). With neither, UTC. Safe to import from client components.

export const TIME_ZONE_COOKIE = "tz";
// The mobile app has no cookie jar, so it reports its zone on every request in this header instead.
export const TIME_ZONE_HEADER = "x-time-zone";
export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

// The calendar day `date` falls on in `zone`, as "YYYY-MM-DD".
export function localDay(date: Date, zone: string): string {
  let format = formatters.get(zone);
  if (!format) {
    // en-CA formats dates as YYYY-MM-DD.
    format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(zone, format);
  }
  return format.format(date);
}

// The "YYYY-MM-DD" day before `day`. Pure calendar arithmetic, so no zone is involved.
export function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
