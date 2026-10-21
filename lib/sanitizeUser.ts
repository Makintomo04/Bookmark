import { User } from "@prisma/client";

export function sanitizeUser<T extends Partial<User>>(user: T): Omit<T, "hashedPassword" | "password"> {
  const { hashedPassword, password, ...safeUser } = user;
  return safeUser;
}
