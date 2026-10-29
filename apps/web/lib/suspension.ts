import prisma from "@/lib/db";
import { isSuspended } from "@/lib/roles";
import { supportEmail } from "@/lib/support";

export { isSuspended };

// A suspended account (set by an admin on /staff/users) is signed out everywhere: getCurrentUser treats it
// as nobody, requireUser answers 403 with this code so the apps can say why, next-auth and the mobile
// sign-in routes refuse it, and suspending deletes its MobileSession rows so the app's refresh token dies.
export const SUSPENDED = "suspended";
// The fallback wording, for a surface that doesn't know which account it is (suspensionNotice says more).
export const SUSPENDED_MESSAGE = "This account is suspended. Email support if you think that's a mistake.";
// Every suspension message starts with this, so a caller holding only the text can tell it apart.
export const SUSPENDED_PREFIX = "This account is suspended";

type SuspensionFields = { suspendedUntil?: Date | string | null; suspensionReason?: string | null };

export interface SuspensionNotice {
  // When it ends (ISO), or null when it lasts until staff lift it.
  until: string | null;
  // What staff gave as the reason, shown to the reader.
  reason: string | null;
  supportEmail: string | null;
  // All of the above as one sentence or three, for surfaces that only show a string.
  message: string;
}

// "5 November 2026 at 14:30 UTC": suspensions run to the hour, and the server doesn't know the reader's zone.
export const formatSuspensionEnd = (until: Date | string) =>
  new Date(until).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).replace(",", " at") + " UTC";

// What a suspended reader is told: when it ends (or that there is no end date), the reason staff gave,
// and how to reach support.
export function suspensionNotice(user: SuspensionFields, support: string | null = supportEmail): SuspensionNotice {
  const until = user.suspendedUntil ? new Date(user.suspendedUntil).toISOString() : null;
  const reason = user.suspensionReason?.trim() || null;
  const parts = [until ? `This account is suspended until ${formatSuspensionEnd(until)}.` : "This account is suspended with no end date."];
  if (reason) parts.push(`Reason: ${/[.!?]$/.test(reason) ? reason : `${reason}.`}`);
  parts.push(support ? `If you think that's a mistake, email ${support}.` : "Email support if you think that's a mistake.");
  return { until, reason, supportEmail: support, message: parts.join(" ") };
}

export async function isUserSuspended(userId: string, now = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true, suspendedUntil: true } });
  return isSuspended(user, now);
}

// Whether what a reader posted (reviews, reading circle comments) is hidden from this viewer: while
// they're suspended, from everyone but themselves. It shows again when the suspension ends or is lifted.
export function hiddenWhileSuspended(
  author: { id: string; suspendedAt?: Date | string | null; suspendedUntil?: Date | string | null },
  viewerId: string | null | undefined,
  now = new Date(),
): boolean {
  return author.id !== viewerId && isSuspended(author, now);
}
