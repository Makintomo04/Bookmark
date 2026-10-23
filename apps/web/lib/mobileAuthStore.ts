import prisma from "@/lib/db";
import type { MobileSessionStore } from "@/lib/mobileAuth";

// lib/mobileAuth.ts's store, on the real database.
export const mobileSessionStore: MobileSessionStore = {
  create: (data) => prisma.mobileSession.create({ data, select: { id: true } }),
  findByHash: (tokenHash) => prisma.mobileSession.findUnique({ where: { tokenHash } }),
  findByPreviousHash: (previousHash) => prisma.mobileSession.findFirst({ where: { previousHash } }),
  async rotate(id, fromHash, data) {
    const { count } = await prisma.mobileSession.updateMany({ where: { id, tokenHash: fromHash }, data });
    return count > 0;
  },
  async delete(id) {
    await prisma.mobileSession.deleteMany({ where: { id } });
  },
};

export async function emailOfUser(userId: string) {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null;
}
