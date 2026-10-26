import prisma from "@/lib/db";
import { isSuspended } from "@/lib/roles";

export { isSuspended };

// A suspended account (set by an admin on /staff/users) is signed out everywhere: getCurrentUser treats it
// as nobody, requireUser answers 403 with this code so the apps can say why, next-auth and the mobile
// sign-in routes refuse it, and suspending deletes its MobileSession rows so the app's refresh token dies.
export const SUSPENDED = "suspended";
export const SUSPENDED_MESSAGE = "This account is suspended. Email support if you think that's a mistake.";

export async function isUserSuspended(userId: string, now = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true, suspendedUntil: true } });
  return isSuspended(user, now);
}
