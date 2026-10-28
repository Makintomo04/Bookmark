import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

// Finds a reader by the (lowercased, lib/handle.ts) username. The stored name is lowercase for every
// account made since usernames were normalised, so the indexed exact match answers almost every time.
// An account from before that may still hold capitals until scripts/lowercase-usernames.ts has run,
// so a miss is tried again without regard to case: without this, such a reader's own profile would
// be unreachable the moment lookups started lowercasing.
export async function findUserByUsername<S extends Prisma.UserSelect>(username: string, select: S): Promise<Prisma.UserGetPayload<{ select: S }> | null> {
  if (!username) return null;
  const exact = await prisma.user.findUnique({ where: { username }, select });
  if (exact) return exact;
  return prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select });
}

// The same, as a where clause, for queries that join on the owner (lists) or take several names.
export const usernameEquals = (username: string): Prisma.StringNullableFilter => ({ equals: username, mode: "insensitive" });
