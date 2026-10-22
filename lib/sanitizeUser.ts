import { User } from "@prisma/client";

// Credentials never leave the server; nor does the Stripe subscription id (the customer id stays:
// settings use it to know the portal can open).
export function sanitizeUser<T extends Partial<User>>(user: T): Omit<T, "hashedPassword" | "password" | "stripeSubscriptionId"> {
  const { hashedPassword, password, stripeSubscriptionId, ...safeUser } = user;
  return safeUser;
}
