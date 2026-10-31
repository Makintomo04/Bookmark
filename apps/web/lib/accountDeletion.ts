import type { Prisma } from "@prisma/client";

// Deleting an account (DELETE /api/user). Kept apart from the route so the order and the coverage can
// be tested against a stubbed database (scripts/test/accountDeletion.test.ts).
//
// MongoDB doesn't enforce relations, and several models reference users by a plain id that Prisma's
// emulated cascades never reach (reads, reading circles, tags, imports), so every collection
// holding the reader's data is cleared here explicitly. A new model with a userId belongs in this list:
// the test fails until it's here.

type Tx = Prisma.TransactionClient;

export interface AccountDeletionDeps {
  db: { $transaction<T>(fn: (tx: Tx) => Promise<T>, options?: { timeout?: number }): Promise<T> };
  // Cancels a Stripe subscription straight away (lib/stripe.ts stripeBillingApi). Undefined when Stripe
  // isn't configured.
  cancelSubscription?: (id: string) => Promise<void>;
  // Reading circles (lib/buddyReadsServer.ts deleteBuddyReadDataFor): hosted circles pass to another member,
  // and the reader's comments stay as a former member's; the route runs lib/clubsServer.ts deleteClubDataFor
  // before it, for their clubs. Runs first, inside the transaction.
  deleteCircleData: (userId: string, tx: Tx) => Promise<void>;
  // Removes the reader from RevenueCat (lib/storeBilling.ts revenueCatApi). App Store and Google Play
  // subscriptions can only be cancelled by the reader in the store, which the app tells them before they
  // delete; this only clears the purchase records. Best effort, after the database, and never blocks.
  deleteStoreCustomer?: (userId: string) => Promise<void>;
  // Removes the account's images from UploadThing, keeping any something else still shows
  // (lib/uploadedImagesServer.ts deleteAccountUploads). Best effort, after the database, and never blocks.
  deleteUploads?: (userId: string, urls: string[]) => Promise<void>;
}

// The subscription couldn't be cancelled, so nothing was deleted.
export class SubscriptionCancelError extends Error {}

export async function deleteAccount(user: { id: string; stripeSubscriptionId?: string | null }, deps: AccountDeletionDeps) {
  // First, and before anything is deleted: once the account is gone the webhook can't match the
  // subscription to anyone, and the reader would go on being charged.
  if (user.stripeSubscriptionId) {
    if (!deps.cancelSubscription) throw new SubscriptionCancelError("Stripe isn't configured, so the subscription can't be cancelled.");
    try {
      await deps.cancelSubscription(user.stripeSubscriptionId);
    } catch (err) {
      throw new SubscriptionCancelError(err instanceof Error ? err.message : String(err));
    }
  }

  // One transaction, so a failure part way leaves the account as it was rather than half deleted.
  // Large shelves take a while, hence the longer timeout.
  let imageUrls: string[] = [];
  await deps.db.$transaction(async (tx) => {
    const userId = user.id;
    await deps.deleteCircleData(userId, tx);
    // Everything they uploaded, plus the avatar, banner and shelf covers (our copies of Open Library covers
    // among them), read before their rows go, so the files can follow.
    const [profile, covers, uploads] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { image: true, banner: true } }),
      tx.book.findMany({ where: { userId }, select: { coverImage: true } }),
      tx.upload.findMany({ where: { userId }, select: { url: true } }),
    ]);
    const list = <T,>(rows: T[] | unknown) => (Array.isArray(rows) ? (rows as T[]) : []);
    imageUrls = Array.from(new Set([
      profile?.image,
      profile?.banner,
      ...list<{ coverImage: string }>(covers).map((b) => b.coverImage),
      ...list<{ url: string }>(uploads).map((u) => u.url),
    ].filter((u): u is string => !!u)));
    await tx.note.deleteMany({ where: { book: { userId } } });
    await tx.bookRead.deleteMany({ where: { userId } });
    await tx.activity.deleteMany({ where: { OR: [{ userId }, { book: { userId } }] } });
    await tx.notification.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } });
    // Comments they wrote on other readers' reviews, and reports they filed of them (comments on their own
    // reviews go with their books).
    await tx.reviewCommentReport.deleteMany({ where: { OR: [{ reporterId: userId }, { comment: { userId } }, { comment: { book: { userId } } }] } });
    // Replies first: a comment can't go while replies still point at it.
    await tx.reviewComment.deleteMany({ where: { parentId: { not: null }, OR: [{ userId }, { book: { userId } }, { parent: { userId } }] } });
    await tx.reviewComment.deleteMany({ where: { OR: [{ userId }, { book: { userId } }] } });
    await tx.book.deleteMany({ where: { userId } });
    await tx.readerTags.deleteMany({ where: { userId } });
    // Their AI recaps and usage counters (Catch me up, Ask the shelf).
    await tx.recap.deleteMany({ where: { userId } });
    await tx.aiUsage.deleteMany({ where: { userId } });
    // Unfinished imports still hold the uploaded file's rows, reviews included.
    await tx.importJob.deleteMany({ where: { userId } });
    await tx.readingGoal.deleteMany({ where: { userId } });
    await tx.readingDay.deleteMany({ where: { userId } });
    await tx.userAchievement.deleteMany({ where: { userId } });
    await tx.bookReport.deleteMany({ where: { reporterId: userId } });
    // Reports they filed, and reports of their reviews (with the excerpt of what they wrote).
    await tx.reviewReport.deleteMany({ where: { OR: [{ reporterId: userId }, { reviewerId: userId }] } });
    await tx.listReport.deleteMany({ where: { OR: [{ reporterId: userId }, { list: { ownerId: userId } }] } });
    // The staff log keeps what was done (a suspension, a grant) but no longer names who it was done to.
    await tx.staffAction.updateMany({ where: { targetType: "user", targetId: userId }, data: { targetId: "deleted-account" } });
    // Staff notes about them and their appeals go with the account (notes staff wrote stay on other readers).
    await tx.staffNote.deleteMany({ where: { userId } });
    await tx.appeal.deleteMany({ where: { userId } });
    await tx.listItem.deleteMany({ where: { list: { ownerId: userId } } });
    await tx.list.deleteMany({ where: { ownerId: userId } });
    await tx.authorFollow.deleteMany({ where: { userId } });
    await tx.seriesFollow.deleteMany({ where: { userId } });
    await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
    await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    await tx.followRequest.deleteMany({ where: { OR: [{ requesterId: userId }, { targetId: userId }] } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    // Signed-in phones and their push tokens.
    await tx.mobileSession.deleteMany({ where: { userId } });
    await tx.pushToken.deleteMany({ where: { userId } });
    // What the reminders and weekly email have sent them.
    await tx.scheduledSend.deleteMany({ where: { userId } });
    await tx.upload.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  }, { timeout: 30_000 });

  // Only once the transaction has committed: a failed deletion keeps the account and its images.
  if (deps.deleteUploads && imageUrls.length) await deps.deleteUploads(user.id, imageUrls);

  if (deps.deleteStoreCustomer) {
    await deps.deleteStoreCustomer(user.id).catch((err) => console.error(`[account] couldn't remove user ${user.id} from RevenueCat:`, err));
  }
}
