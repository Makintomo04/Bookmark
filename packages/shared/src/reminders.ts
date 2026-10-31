// Reminders that bring a reader back (BOO-48): a daily nudge at a time they pick, an evening warning
// before a streak ends, and a heads-up before a circle checkpoint they're behind on. All opt-in, all free,
// all in the reader's own time zone and never inside their quiet hours. Sent by the cron tick
// (apps/web/lib/jobs); the rules and words are here so the settings screens and tests agree.
//
// The words only ever use the reader's own book and numbers. Nothing is AI-written, and nothing anyone
// else wrote (comments, reviews, notes) reaches a lock screen. No database imports: plain Node loads this.

import { previousDay } from "./timeZone";
import type { PushContent, PushGroup } from "./push";

// Times are minutes past local midnight (0 to 1439).
export const MINUTES_IN_DAY = 24 * 60;
export const DEFAULT_QUIET_START = 22 * 60;
export const DEFAULT_QUIET_END = 8 * 60;
// The reminder time picker's step, and how long after its slot a send is still due. The tick runs every
// 15 minutes, so one missed tick still delivers, a little late; the ledger stops a second send.
export const REMINDER_STEP = 15;
export const DUE_WINDOW = 45;
// The streak alert only for a streak worth saving, and at 19:00 unless quiet hours start sooner.
export const STREAK_ALERT_MIN_DAYS = 3;
export const STREAK_ALERT_MINUTE = 19 * 60;
// Checkpoint reminders: two days before the section is due, in the morning.
export const CHECKPOINT_DAYS_AHEAD = 2;
export const CHECKPOINT_MINUTE = 9 * 60;
// The weekly email: Sunday morning.
export const DIGEST_WEEKDAY = 0;
export const DIGEST_MINUTE = 9 * 60;

export interface QuietHours {
  start: number;
  end: number;
}

export const quietHoursOf = (start: number | null | undefined, end: number | null | undefined): QuietHours => ({
  start: start ?? DEFAULT_QUIET_START,
  end: end ?? DEFAULT_QUIET_END,
});

// ---- The reader's clock -------------------------------------------------------------------

export interface LocalClock {
  // "YYYY-MM-DD"
  day: string;
  // Minutes past local midnight.
  minute: number;
  // 0 is Sunday.
  weekday: number;
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

export function localClock(date: Date, zone: string): LocalClock {
  let format = clockFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clockFormats.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, minute: Number(parts.hour) * 60 + Number(parts.minute), weekday: new Date(`${day}T00:00:00Z`).getUTCDay() };
}

// The "YYYY-MM-DD" day `n` days after `day`.
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

// The ISO week a local day falls in, as "2026-W44": the weekly email's once-a-week key.
export function isoWeekKey(day: string): string {
  // A week runs Monday to Sunday and belongs to the year its Thursday is in.
  const thursday = (d: Date) => {
    const t = new Date(d);
    t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
    return t;
  };
  const target = thursday(new Date(`${day}T00:00:00Z`));
  const year = target.getUTCFullYear();
  // 4 January is always in week 1.
  const first = thursday(new Date(Date.UTC(year, 0, 4)));
  const week = 1 + Math.round((target.getTime() - first.getTime()) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// "19:30" for 1170, and back. Settings send times as "HH:MM".
export const formatMinute = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function parseMinute(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export const isReminderStep = (minute: number) => Number.isInteger(minute) && minute >= 0 && minute < MINUTES_IN_DAY && minute % REMINDER_STEP === 0;

// ---- Settings ------------------------------------------------------------------------------

// What GET and PATCH /api/push/settings carry for reminders, as the web and app settings show them.
export interface ReminderSettings {
  // "HH:MM", or null when the daily reminder is off.
  dailyAt: string | null;
  streak: boolean;
  checkpoints: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface EmailSettings {
  weekly: boolean;
  // The weekly email only goes to a confirmed address.
  verified: boolean;
}

// The whole of GET /api/push/settings, and what a PATCH may change.
export interface NotificationSettings {
  push: Partial<Record<PushGroup, boolean>>;
  reminders: ReminderSettings;
  email: EmailSettings;
  // The reminders sheet has been shown once already.
  prompted: boolean;
  // They've signed in to the app on a phone, so pushes have somewhere to go.
  hasPhone: boolean;
}

export interface NotificationChange {
  push?: Partial<Record<PushGroup, boolean>>;
  reminders?: Partial<ReminderSettings>;
  email?: { weekly?: boolean };
  prompted?: true;
}

// A change applied ahead of the server's answer, so a switch moves straight away.
export const withChange = (s: NotificationSettings, c: NotificationChange): NotificationSettings => ({
  ...s,
  push: { ...s.push, ...c.push },
  reminders: { ...s.reminders, ...c.reminders },
  email: { ...s.email, ...c.email },
  prompted: s.prompted || !!c.prompted,
});

// The switches' words, the same in Settings on the web and in the app, and on the reminders sheet.
export const REMINDER_COPY = {
  daily: { title: "Daily reminder", hint: "A nudge at a time you pick. Skipped on days you've already read." },
  streak: { title: "Streak alert", hint: `One warning in the evening when a streak of ${STREAK_ALERT_MIN_DAYS} days or more is about to end.` },
  checkpoints: { title: "Circle checkpoints", hint: "Two days before a section is due, if you're behind." },
  weekly: { title: "Weekly email", hint: "“Your week in books” on Sunday mornings: your reading, your circles and your friends. One click to stop." },
  quiet: { title: "Quiet hours", hint: "Reminders never arrive between these times." },
  // On the web, where reminders can't reach.
  phoneOnly: "Reminders arrive on your phone through the Bookmark app.",
  unverified: "Confirm your email address first: the weekly email only goes to a confirmed address.",
} as const;

// Every time the daily reminder may be set to: quarter hours outside quiet hours.
export const reminderTimes = (quiet: QuietHours): number[] =>
  Array.from({ length: MINUTES_IN_DAY / REMINDER_STEP }, (_, i) => i * REMINDER_STEP).filter((m) => !inQuietHours(m, quiet));

// "7:30pm", for the pickers.
export function clockLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

// ---- When things are due -------------------------------------------------------------------

// Quiet hours run from `start` up to `end`, wrapping midnight when start is later (22:00 to 08:00).
// Equal start and end means none.
export function inQuietHours(minute: number, quiet: QuietHours): boolean {
  if (quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? minute >= quiet.start && minute < quiet.end : minute >= quiet.start || minute < quiet.end;
}

// Due from the slot until the window closes. It doesn't wrap midnight: the day's key would change with it,
// and every slot the picker offers sits outside quiet hours, which cover the small hours by default.
export const isDue = (slot: number, minute: number, window = DUE_WINDOW) => minute >= slot && minute < slot + window;

// 19:00, or an hour before an evening start to quiet hours that comes sooner. Quiet hours starting after
// midnight, or in the morning, don't move it.
export function streakAlertMinute(quiet: QuietHours): number {
  if (quiet.start >= 12 * 60 && quiet.start - 60 < STREAK_ALERT_MINUTE) return Math.max(12 * 60, quiet.start - 60);
  return STREAK_ALERT_MINUTE;
}

// ---- The streak -----------------------------------------------------------------------------

// The run of reading days ending today, or ending yesterday while today isn't over: the same count as
// lib/achievements.ts readingStreak. `readToday` says which, so a streak at risk is { streak > 0, !readToday }.
export function streakState(active: Set<string>, today: string, cap = Infinity): { streak: number; readToday: boolean } {
  const readToday = active.has(today);
  let cursor = readToday ? today : previousDay(today);
  let streak = 0;
  while (streak < cap && active.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return { streak, readToday };
}

// ---- The one reading nudge a day -------------------------------------------------------------

export interface NudgeInput {
  minute: number;
  quiet: QuietHours;
  // null when the daily reminder is off.
  reminderMinute: number | null;
  streakAlerts: boolean;
  streak: number;
  readToday: boolean;
}

// What to send this tick, if anything. A reader who has already read today gets nothing: "time to read"
// after reading is noise. At most one nudge a day (the jobs share one ledger key), and when the streak is
// at risk the streak alert takes the reminder's place: at its own time, or at an evening reminder's.
export function nudgeFor(n: NudgeInput): "reminder" | "streak" | null {
  if (n.readToday || inQuietHours(n.minute, n.quiet)) return null;
  const atRisk = n.streakAlerts && n.streak >= STREAK_ALERT_MIN_DAYS;
  const streakAt = streakAlertMinute(n.quiet);
  if (atRisk && isDue(streakAt, n.minute)) return "streak";
  if (n.reminderMinute !== null && isDue(n.reminderMinute, n.minute)) {
    return atRisk && n.reminderMinute >= streakAt ? "streak" : "reminder";
  }
  return null;
}

// ---- The words -----------------------------------------------------------------------------

export interface ReminderBook {
  id: string;
  title: string;
  // Where they are and how long it is, in the book's unit; null when not known.
  at: number | null;
  of: number | null;
  unit: "PAGES" | "MINUTES";
}

const placeIn = (b: ReminderBook) => {
  if (b.at === null || b.at <= 0) return null;
  if (b.unit === "MINUTES") return `${Math.floor(b.at / 60) > 0 ? `${Math.floor(b.at / 60)}h ` : ""}${b.at % 60}m into`;
  return b.of ? `on page ${b.at} of ${b.of} of` : `on page ${b.at} of`;
};

// The daily reminder: the book they're furthest into, or a nudge to pick one.
export function readingReminderPush(book: ReminderBook | null): PushContent {
  if (!book) return { title: "Time to read?", body: "Pick something from Want to read.", path: "/" };
  const place = placeIn(book);
  return {
    title: "Time to read?",
    body: place ? `You're ${place} ${book.title}.` : `${book.title} is waiting for you.`,
    path: `/book/${book.id}`,
  };
}

export function streakAlertPush(days: number): PushContent {
  return { title: `Your ${days}-day streak ends tonight`, body: "Log a page to keep it going.", path: "/" };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CheckpointReminder {
  circleId: string;
  label: string;
  // "YYYY-MM-DD"
  due: string;
  progress: number;
  until: number;
  // Comments posted in the section ahead of them, counted and never quoted.
  waiting: number;
}

export function checkpointPush(c: CheckpointReminder): PushContent {
  const weekday = WEEKDAYS[new Date(`${c.due}T00:00:00Z`).getUTCDay()];
  const waiting = c.waiting > 0 ? ` ${c.waiting === 1 ? "A comment is" : `${c.waiting} comments are`} waiting there.` : "";
  return {
    title: `${c.label} is due ${weekday}`,
    body: `You're at ${Math.round(c.progress)}% and it ends at ${Math.round(c.until)}%.${waiting}`,
    path: `/circles/${c.circleId}`,
  };
}
