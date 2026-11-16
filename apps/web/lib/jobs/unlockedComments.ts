import type { Prisma } from "@prisma/client";

// The comments a member has unlocked since their last weekly email: those their progress reaches now that it
// didn't then (`lastProgress`, BuddyReadMember.digestProgress), whenever they were posted, and those posted
// since within what they'd already reached. Before their first email, the ones posted since that they reach.
export function unlockedCommentsWhere(progress: number, lastProgress: number | null | undefined, since: Date): Prisma.BuddyReadCommentWhereInput {
  if (lastProgress == null) return { createdAt: { gte: since }, position: { lte: progress } };
  return { position: { lte: progress }, OR: [{ position: { gt: lastProgress } }, { createdAt: { gte: since } }] };
}
