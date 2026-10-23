import { UTApi } from "uploadthing/server";
import prisma from "@/lib/db";
import { deleteUnusedUploads, type UploadCleanupDeps } from "@/lib/uploadedImages";

// The database and UploadThing side of lib/uploadedImages.ts. Every field that can hold an image URL is
// checked, so a file still shown anywhere is kept.
const deps: UploadCleanupDeps = {
  async stillUsed(urls) {
    const [users, banners, books, works, editions, items, circles] = await Promise.all([
      prisma.user.findMany({ where: { image: { in: urls } }, select: { image: true } }),
      prisma.user.findMany({ where: { banner: { in: urls } }, select: { banner: true } }),
      prisma.book.findMany({ where: { coverImage: { in: urls } }, select: { coverImage: true } }),
      prisma.work.findMany({ where: { coverUrl: { in: urls } }, select: { coverUrl: true } }),
      prisma.edition.findMany({ where: { coverUrl: { in: urls } }, select: { coverUrl: true } }),
      prisma.listItem.findMany({ where: { coverUrl: { in: urls } }, select: { coverUrl: true } }),
      prisma.buddyRead.findMany({ where: { coverImage: { in: urls } }, select: { coverImage: true } }),
    ]);
    return new Set(
      [
        ...users.map((r) => r.image),
        ...banners.map((r) => r.banner),
        ...books.map((r) => r.coverImage),
        ...works.map((r) => r.coverUrl),
        ...editions.map((r) => r.coverUrl),
        ...items.map((r) => r.coverUrl),
        ...circles.map((r) => r.coverImage),
      ].filter((u): u is string => !!u),
    );
  },
  async deleteFiles(keys) {
    const res = await new UTApi().deleteFiles(keys);
    if (!res.success) throw new Error("UploadThing didn't delete the files");
  },
};

// For account deletion: removes the account's images that nothing else uses. Never throws.
export async function deleteAccountUploads(userId: string, urls: string[]) {
  try {
    const { deleted, kept } = await deleteUnusedUploads(urls, deps);
    if (deleted.length || kept.length) console.log(`[account] user ${userId}: deleted ${deleted.length} uploaded image(s), kept ${kept.length} still in use`);
  } catch (err) {
    console.error(`[account] couldn't delete uploaded images for user ${userId}:`, err);
  }
}
