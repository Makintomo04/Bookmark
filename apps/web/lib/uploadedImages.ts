// Removing a deleted account's images from UploadThing: the avatar, the banner, and the covers on their
// shelf that live in our storage (ones they uploaded, and Open Library covers we copied for them).
//
// A cover's URL can be copied into records that outlive the account: a reading circle's snapshot of the
// host's book (circles pass to another member), a list item someone else copied, another reader's shelf,
// or the shared catalogue. So a file is only deleted once nothing left in the database points at it.
//
// Pure apart from the two calls handed in, so scripts/test/uploadedImages.test.ts runs it with fakes.
// The Prisma and UploadThing side is lib/uploadedImagesServer.ts.

// UploadThing's file URLs: https://utfs.io/a/<app>/<key> (what uploadFiles returns today),
// https://utfs.io/f/<key>, or https://<app>.ufs.sh/f/<key> from newer SDKs.
export function uploadThingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname, pathname } = new URL(url);
    if (protocol !== "https:" || !(hostname === "utfs.io" || hostname.endsWith(".ufs.sh"))) return null;
    const match = pathname.match(/^\/(?:f|a\/[^/]+)\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export interface UploadCleanupDeps {
  // Of these URLs, the ones some record still uses (checked after the account's own rows are gone).
  stillUsed: (urls: string[]) => Promise<Set<string>>;
  deleteFiles: (keys: string[]) => Promise<void>;
}

// Deletes the files behind these URLs that nothing else uses. Returns which keys went and which stayed.
export async function deleteUnusedUploads(urls: (string | null | undefined)[], deps: UploadCleanupDeps) {
  const ours = Array.from(new Set(urls.filter((u): u is string => uploadThingKey(u) !== null)));
  if (ours.length === 0) return { deleted: [] as string[], kept: [] as string[] };

  const used = await deps.stillUsed(ours);
  // Two URLs can name one file (the utfs.io and ufs.sh forms), so a key used under either is kept.
  const keptKeys = new Set(ours.filter((u) => used.has(u)).map((u) => uploadThingKey(u)!));
  const keys = Array.from(new Set(ours.map((u) => uploadThingKey(u)!)));
  const deleted = keys.filter((k) => !keptKeys.has(k));
  if (deleted.length) await deps.deleteFiles(deleted);
  return { deleted, kept: Array.from(keptKeys) };
}
