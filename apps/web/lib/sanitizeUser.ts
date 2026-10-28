import { User } from "@prisma/client";

type Private = "hashedPassword" | "password" | "stripeSubscriptionId" | "suspendedAt" | "suspendedUntil" | "suspensionReason" | "suspendedById";

// Credentials never leave the server; nor does the Stripe subscription id (the customer id stays:
// settings use it to know the portal can open), nor the moderation fields (a suspended account can't
// load the app anyway). `role` stays: the client shows staff controls by it (lib/roles.ts).
// `displayName` passes through: it is public, shown wherever the username heads a profile or a row.
export function sanitizeUser<T extends Partial<User>>(user: T): Omit<T, Private> {
  const { hashedPassword, password, stripeSubscriptionId, suspendedAt, suspendedUntil, suspensionReason, suspendedById, ...safeUser } = user;
  return safeUser;
}
