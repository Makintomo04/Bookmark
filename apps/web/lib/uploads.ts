import prisma from "@/lib/db";
import { isShareableCover, uploadThingKey } from "@/lib/uploadedImages";

// Readers' uploads (the Upload model): recording them, and keeping them on the uploader's own profile and
// shelf. Every place a cover is copied or shown to someone else asks shareableCover first, so one reader's
// photo never becomes the cover other readers see. The rules are in lib/uploadedImages.ts.

export type UploadKind = "avatar" | "banner" | "cover" | "image";
export const UPLOAD_KINDS: UploadKind[] = ["avatar", "banner", "cover", "image"];

export async function recordUpload(upload: { key: string; url: string; userId: string; kind?: UploadKind }) {
  await prisma.upload.upsert({
    where: { key: upload.key },
    create: { key: upload.key, url: upload.url, userId: upload.userId, kind: upload.kind ?? "image" },
    update: {},
  });
}

// Who uploaded each of these covers, by file key. Covers that aren't uploads aren't in the map.
export async function uploadersOf(urls: (string | null | undefined)[]): Promise<Map<string, string>> {
  const keys = Array.from(new Set(urls.map(uploadThingKey).filter((k): k is string => !!k)));
  if (keys.length === 0) return new Map();
  const rows = await prisma.upload.findMany({ where: { key: { in: keys } }, select: { key: true, userId: true } });
  return new Map(rows.map((r) => [r.key, r.userId]));
}

// The cover itself when it may go here, otherwise null. `ownerId` is the reader whose own copy it's for, or
// null for anywhere shared (see isShareableCover).
export async function shareableCover(url: string | null | undefined, ownerId: string | null): Promise<string | null> {
  if (!url) return null;
  return isShareableCover(url, await uploadersOf([url]), ownerId) ? url : null;
}

// The catalogue's cover for a book: its edition's, else its work's. Never an upload (lib/catalog.ts keeps
// them out), so it's what a copy falls back to when the cover it would have taken was someone's upload.
export async function catalogueCover(book: { editionId?: string | null; workId?: string | null; workKey?: string | null }): Promise<string | null> {
  if (book.editionId) {
    const edition = await prisma.edition.findUnique({ where: { id: book.editionId }, select: { coverUrl: true, work: { select: { coverUrl: true } } } });
    if (edition?.coverUrl || edition?.work?.coverUrl) return edition.coverUrl ?? edition.work?.coverUrl ?? null;
  }
  const work = book.workId
    ? await prisma.work.findUnique({ where: { id: book.workId }, select: { coverUrl: true } })
    : book.workKey ? await prisma.work.findFirst({ where: { openLibraryKey: book.workKey }, select: { coverUrl: true } }) : null;
  return work?.coverUrl ?? null;
}

// A cover for somewhere a copy is made from another reader's book: theirs when it's shareable, otherwise
// the catalogue's for that book.
export async function coverToShare(url: string | null | undefined, book: Parameters<typeof catalogueCover>[0], ownerId: string | null) {
  return (await shareableCover(url, ownerId)) ?? (await catalogueCover(book));
}

// List items are shown to everyone who can see the list, so none keeps an uploaded cover (its book's
// card shows instead). Used wherever list items are written: create, edit, remix, add from the shelf.
export async function withoutUploadedCovers<T extends { coverUrl?: string | null }>(items: T[]): Promise<T[]> {
  const uploaders = await uploadersOf(items.map((i) => i.coverUrl));
  if (uploaders.size === 0) return items;
  return items.map((i) => (i.coverUrl && !isShareableCover(i.coverUrl, uploaders, null) ? { ...i, coverUrl: null } : i));
}
