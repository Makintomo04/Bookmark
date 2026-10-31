import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

// Every scheduled send claims its ScheduledSend row first and only sends once the claim is theirs. The
// row is unique per (user, kind, key), so a retried tick, two overlapping ticks or a double deploy can't
// send the same reminder twice. A send that fails after claiming isn't retried: one reminder too few is
// better than two.

// "nudge" is the daily reminder and "streak" the streak alert, one of each per local day at most.
export type SendKind = "nudge" | "streak" | "checkpoint" | "digest";

export interface LedgerDb {
  scheduledSend: {
    create(args: { data: { userId: string; kind: string; key: string; channel: string } }): Promise<unknown>;
    deleteMany(args: { where: { sentAt: { lt: Date } } }): Promise<{ count: number }>;
  };
}

// True when this call claimed the send; false when it was already sent (or is being sent). Channel "none"
// settles a send that turned out to have nothing to say (an empty week), so it isn't built again.
export async function claimSend(userId: string, kind: SendKind, key: string, channel: "push" | "email" | "none", db: LedgerDb = prisma): Promise<boolean> {
  try {
    await db.scheduledSend.create({ data: { userId, kind, key, channel } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export const LEDGER_KEEP_DAYS = 60;

export async function clearOldSends(now = new Date(), db: LedgerDb = prisma): Promise<number> {
  const before = new Date(now.getTime() - LEDGER_KEEP_DAYS * 24 * 60 * 60 * 1000);
  return (await db.scheduledSend.deleteMany({ where: { sentAt: { lt: before } } })).count;
}
