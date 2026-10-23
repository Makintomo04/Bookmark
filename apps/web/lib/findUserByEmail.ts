import prisma from "@/lib/db";

// Older accounts store the email exactly as it was typed, so try an exact match first and then ignore
// case: someone who signed up as Jane@Gmail.com (a phone capitalised it) can still sign in as jane@gmail.com.
// Callers should use the returned user's email, not the typed one, for anything keyed by it.
export async function findUserByEmail(email: string) {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}
