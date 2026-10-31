import { NextResponse } from "next/server";
import type { Prisma, User } from "@prisma/client";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { isStaffRole } from "@/lib/roles";
import { requestTimeZone, resolveTimeZone } from "@/lib/achievements";
import { isPushGroup, pushGroupsFor, type PushGroup } from "@bookmark/shared/push";
import {
  formatMinute,
  inQuietHours,
  isReminderStep,
  parseMinute,
  quietHoursOf,
  type EmailSettings,
  type ReminderSettings,
} from "@bookmark/shared/reminders";

// The reader's notification settings, for the web and app settings screens and the reminders sheet:
//   push: the kinds of push they switched off (packages/shared/src/push.ts PUSH_GROUPS). The bell keeps
//     every notification either way. Staff groups are only in a staff member's settings, on until they
//     switch them off.
//   reminders: the opt-in reminders (BOO-48): a daily time, the streak alert, circle checkpoints, and
//     quiet hours. Off until turned on.
//   email: the weekly email, off until turned on; turning it on records when (the consent record).
//   prompted: whether the reminders sheet has been shown after their first finished book.
// Older app builds only send and read `push`, which works as before.

type SettingsUser = Pick<
  User,
  | "pushOff"
  | "readingReminderMinute"
  | "streakAlerts"
  | "checkpointReminders"
  | "quietStartMinute"
  | "quietEndMinute"
  | "weeklyEmail"
  | "remindersPromptedAt"
  | "role"
> & { isStaff?: boolean | null; emailVerified: Date | string | null };

const pushOf = (off: string[], isStaff: boolean) =>
  Object.fromEntries(pushGroupsFor(isStaff).map((g) => [g, !off.includes(g)])) as Partial<Record<PushGroup, boolean>>;

function settingsOf(user: SettingsUser, hasPhone: boolean) {
  const quiet = quietHoursOf(user.quietStartMinute, user.quietEndMinute);
  const reminders: ReminderSettings = {
    dailyAt: user.readingReminderMinute == null ? null : formatMinute(user.readingReminderMinute),
    streak: !!user.streakAlerts,
    checkpoints: !!user.checkpointReminders,
    quietStart: formatMinute(quiet.start),
    quietEnd: formatMinute(quiet.end),
  };
  const email: EmailSettings = { weekly: !!user.weeklyEmail, verified: !!user.emailVerified };
  return { push: pushOf(user.pushOff ?? [], isStaffRole(user)), reminders, email, prompted: !!user.remindersPromptedAt, hasPhone };
}

const hasPhone = async (userId: string) => (await prisma.pushToken.count({ where: { userId } })) > 0;
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json(settingsOf(user, await hasPhone(user.id)));
}

// Body: any of
//   { push: { circles?: boolean, follows?: boolean, ... } }
//   { reminders: { dailyAt?: "HH:MM" | null, streak?: boolean, checkpoints?: boolean, quietStart?: "HH:MM", quietEnd?: "HH:MM" } }
//   { email: { weekly?: boolean } }
//   { prompted: true }
export async function PATCH(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !(body.push || body.reminders || body.email || body.prompted === true)) return bad("Nothing to change.");

  const data: Prisma.UserUpdateInput & { quietStartMinute?: number; quietEndMinute?: number; readingReminderMinute?: number | null } = {};
  let turnedOn = false;

  if (body.push !== undefined) {
    if (typeof body.push !== "object" || body.push === null) return bad("Unknown setting.");
    const allowed = pushGroupsFor(isStaffRole(user));
    const off = new Set((user.pushOff ?? []).filter(isPushGroup));
    for (const [group, on] of Object.entries(body.push)) {
      if (!isPushGroup(group) || !allowed.includes(group) || typeof on !== "boolean") return bad("Unknown setting.");
      if (on) off.delete(group);
      else off.add(group);
    }
    data.pushOff = Array.from(off);
  }

  if (body.reminders !== undefined) {
    const r = body.reminders;
    if (typeof r !== "object" || r === null) return bad("Unknown setting.");
    for (const key of ["quietStart", "quietEnd"] as const) {
      if (r[key] === undefined) continue;
      const minute = parseMinute(r[key]);
      if (minute === null || !isReminderStep(minute)) return bad("Pick quiet hours on the quarter hour.");
      data[key === "quietStart" ? "quietStartMinute" : "quietEndMinute"] = minute;
    }
    if (r.dailyAt !== undefined) {
      if (r.dailyAt === null) data.readingReminderMinute = null;
      else {
        const minute = parseMinute(r.dailyAt);
        if (minute === null || !isReminderStep(minute)) return bad("Pick a reminder time on the quarter hour.");
        data.readingReminderMinute = minute;
        turnedOn = true;
      }
    }
    for (const [key, field] of [["streak", "streakAlerts"], ["checkpoints", "checkpointReminders"]] as const) {
      if (r[key] === undefined) continue;
      if (typeof r[key] !== "boolean") return bad("Unknown setting.");
      data[field] = r[key];
      if (r[key]) turnedOn = true;
    }
    // The reminder can't sit inside quiet hours, whichever of the two just changed.
    const reminder = data.readingReminderMinute !== undefined ? data.readingReminderMinute : user.readingReminderMinute;
    const quiet = quietHoursOf(data.quietStartMinute ?? user.quietStartMinute, data.quietEndMinute ?? user.quietEndMinute);
    if (reminder != null && inQuietHours(reminder, quiet)) return bad("That time is inside your quiet hours. Pick another, or change your quiet hours.");
  }

  if (body.email !== undefined) {
    if (typeof body.email !== "object" || body.email === null) return bad("Unknown setting.");
    if (body.email.weekly !== undefined) {
      if (typeof body.email.weekly !== "boolean") return bad("Unknown setting.");
      data.weeklyEmail = body.email.weekly;
      if (body.email.weekly && !user.weeklyEmail) {
        data.weeklyEmailConsentAt = new Date();
        turnedOn = true;
      }
    }
  }

  if (body.prompted === true && !user.remindersPromptedAt) data.remindersPromptedAt = new Date();

  // Reminders go out in the reader's own time: keep the zone current whenever one is turned on.
  if (turnedOn) await resolveTimeZone(user.id, await requestTimeZone());
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json(settingsOf(updated, await hasPhone(user.id)));
}
