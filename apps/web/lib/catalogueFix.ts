import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { DESCRIPTION_MAX } from "@/lib/openLibrary";
import { copyCoverToUploadThing, isOpenLibraryCoverUrl, mirrorCover } from "@/lib/covers";
import { uploadersOf } from "@/lib/uploads";
import { uploadThingKey } from "@/lib/uploadedImages";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { workMatchKey } from "@/lib/catalog/normalise";
import { openLibraryLookup } from "@/lib/catalog/lookup";
import { resolveCatalog } from "@/lib/catalog";
import { workKeyOfQuery } from "@/lib/workKey";
import {
  changedFields,
  editionCopyUpdates,
  mergeCurated,
  parseEditionFix,
  parseWorkFix,
  workCopyUpdates,
  type CopyUpdate,
} from "@/lib/catalogueFixRules";

// A librarian's correction to the shared catalogue, from /staff/catalogue or "Fix this book" on a book
// page. The rules (what may change, which readers' copies follow) are in lib/catalogueFixRules.ts.

const editionSelect = { id: true, key: true, format: true, pages: true, isbn13: true, isbn10: true, publisher: true, publishedYear: true, coverUrl: true, curatedFields: true } as const;
const workSelect = {
  id: true, key: true, openLibraryKey: true, hardcoverId: true, pageApprovedAt: true, title: true, authors: true, description: true, coverUrl: true, firstPublishYear: true, curatedFields: true,
  editions: { select: editionSelect, take: 20 },
  _count: { select: { books: true } },
} as const;

export type StaffWork = NonNullable<Awaited<ReturnType<typeof findStaffWork>>>;

export const findStaffWork = (id: string) => prisma.work.findUnique({ where: { id }, select: workSelect });

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Search by id, Open Library key (OL45883W), ISBN or title.
export async function searchWorks(query: string, limit = 20): Promise<StaffWork[]> {
  const q = query.trim();
  if (!q) return [];
  if (isObjectId(q)) {
    const one = await findStaffWork(q);
    return one ? [one] : [];
  }
  const digits = q.replace(/[^0-9Xx]/g, "");
  if (digits.length === 10 || digits.length === 13) {
    const editions = await prisma.edition.findMany({ where: { OR: [{ isbn13: digits }, { isbn10: digits.toUpperCase() }] }, select: { workId: true }, take: limit });
    if (editions.length) {
      return prisma.work.findMany({ where: { id: { in: Array.from(new Set(editions.map((e) => e.workId))) } }, select: workSelect });
    }
  }
  const olKey = workKeyOfQuery(q);
  if (olKey) return prisma.work.findMany({ where: { openLibraryKey: olKey }, select: workSelect, take: limit });
  return prisma.work.findMany({ where: { title: { contains: escapeRegex(q), mode: "insensitive" } }, select: workSelect, take: limit });
}

// A book page can show a book straight from Open Library before any reader has shelved it, so it isn't
// in the catalogue yet and there's nothing to correct. This files it, the way a reader adding it would.
export async function addWorkFromOpenLibrary(actor: Actor, key: string): Promise<StaffOutcome<StaffWork>> {
  const olKey = workKeyOfQuery(key);
  if (!olKey) return staffFail(400, "That isn't an Open Library work id (like OL45883W).");
  const existing = await prisma.work.findFirst({ where: { openLibraryKey: olKey }, select: { id: true } });
  if (existing) return { ok: true, value: (await findStaffWork(existing.id))! };
  const facts = await openLibraryLookup.work(olKey).catch(() => null);
  if (!facts?.title) return staffFail(404, `Open Library doesn't have a book at ${olKey}.`);
  const { work } = await resolveCatalog({ workKey: olKey, title: facts.title }, { lookup: true, describe: true });
  await logStaffAction({ actorId: actor.id, action: "work.add", targetType: "work", targetId: work.id, after: { openLibraryKey: olKey, title: work.title } });
  return { ok: true, value: (await findStaffWork(work.id))! };
}

// A cover for the catalogue: never a reader's upload (lib/uploads.ts), and copied to our own storage.
// Book pages only load images from the hosts in next.config.mjs, so a cover left on a publisher's or
// a shop's site would save but never show.
async function catalogueCoverFrom(url: string | null | undefined) {
  if (!url) return { ok: true as const, url: url ?? null };
  if ((await uploadersOf([url])).size) return { ok: false as const, error: "That cover is a reader's own upload, so it can't go in the shared catalogue." };
  if (isOpenLibraryCoverUrl(url)) return { ok: true as const, url: await mirrorCover(url) };
  if (uploadThingKey(url)) return { ok: true as const, url };
  try {
    return { ok: true as const, url: await copyCoverToUploadThing(url) };
  } catch (err) {
    console.warn(`Couldn't copy cover ${url}:`, err instanceof Error ? err.message : err);
    return { ok: false as const, error: "Couldn't fetch an image from that link. Use the image's own address (right-click the cover, Copy image address)." };
  }
}

// Book rows on the work (or edition), list items and reading circles on the Open Library work key. A work-wide fix skips
// copies on an edition a librarian gave its own cover, which that edition's fix decides instead.
// Counts each copy once, however many of its fields changed.
async function applyCopyUpdates(updates: CopyUpdate[], scope: { workId?: string; editionId?: string; workKey?: string | null; skipEditionIds?: string[] }) {
  const books = new Set<string>();
  const listItems = new Set<string>();
  const circles = new Set<string>();
  const bookScope: Prisma.BookWhereInput = scope.editionId
    ? { editionId: scope.editionId }
    : { workId: scope.workId, ...(scope.skipEditionIds?.length && { NOT: { editionId: { in: scope.skipEditionIds } } }) };
  for (const u of updates) {
    if (u.model === "book") {
      let ids: string[];
      if (u.from === "catalogue") {
        const rows = await prisma.book.findMany({ where: { AND: [bookScope, { NOT: { coverImage: String(u.to) } }] }, select: { id: true, coverImage: true } });
        const uploads = await uploadersOf(rows.map((r) => r.coverImage));
        ids = rows.filter((r) => !uploads.has(uploadThingKey(r.coverImage) ?? "")).map((r) => r.id);
      } else if (u.from === "any") {
        ids = (await prisma.book.findMany({ where: { AND: [bookScope, { NOT: { [u.field]: u.to } }] }, select: { id: true } })).map((r) => r.id);
      } else {
        ids = (await prisma.book.findMany({ where: { AND: [bookScope, { [u.field]: { in: u.from } }] }, select: { id: true } })).map((r) => r.id);
      }
      if (ids.length) await prisma.book.updateMany({ where: { id: { in: ids } }, data: { [u.field]: u.to } });
      ids.forEach((id) => books.add(id));
    } else if (u.model === "circle") {
      if (!scope.workKey) continue;
      let ids: string[];
      if (u.from === "catalogue") {
        // A circle's cover came from the host's copy, which may be their own upload; that stays.
        const rows = await prisma.buddyRead.findMany({ where: { workKey: scope.workKey, NOT: { coverImage: String(u.to) } }, select: { id: true, coverImage: true } });
        const uploads = await uploadersOf(rows.map((r) => r.coverImage));
        ids = rows.filter((r) => !uploads.has(uploadThingKey(r.coverImage) ?? "")).map((r) => r.id);
      } else {
        ids = (await prisma.buddyRead.findMany({ where: { workKey: scope.workKey, [u.field]: { in: u.from } }, select: { id: true } })).map((r) => r.id);
      }
      if (ids.length) await prisma.buddyRead.updateMany({ where: { id: { in: ids } }, data: { [u.field]: u.to } });
      ids.forEach((id) => circles.add(id));
    } else if (scope.workKey) {
      // List items never hold an upload (lib/uploads.ts withoutUploadedCovers), so "catalogue" is all of them.
      const match = u.from === "catalogue" ? { NOT: { [u.field]: u.to } } : { [u.field]: { in: u.from } };
      const ids = (await prisma.listItem.findMany({ where: { workKey: scope.workKey, ...match }, select: { id: true } })).map((r) => r.id);
      if (ids.length) await prisma.listItem.updateMany({ where: { id: { in: ids } }, data: { [u.field]: u.to } });
      ids.forEach((id) => listItems.add(id));
    }
  }
  return { books: books.size, listItems: listItems.size, circles: circles.size };
}

export type FixResult = StaffOutcome<{ work: StaffWork; copies: { books: number; listItems: number; circles: number } }>;

type Actor = { id: string };

export async function fixWork(actor: Actor, id: string, body: Record<string, unknown>, reason?: string): Promise<FixResult> {
  if (!isObjectId(id)) return staffFail(404, "No book with that id.");
  const work = await findStaffWork(id);
  if (!work) return staffFail(404, "No book with that id.");
  const parsed = parseWorkFix(body, DESCRIPTION_MAX);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const patch = parsed.patch;
  if ("coverUrl" in patch) {
    const cover = await catalogueCoverFrom(patch.coverUrl);
    if (!cover.ok) return staffFail(400, cover.error);
    patch.coverUrl = cover.url;
  }
  const changed = changedFields(work, patch) as string[];
  if (!changed.length) return { ok: true, value: { work, copies: { books: 0, listItems: 0, circles: 0 } } };

  const before = Object.fromEntries(changed.map((k) => [k, work[k as keyof typeof work]]));
  // A new title or first author files the work under a new match key (lib/catalog/resolve.ts), so later
  // readers' copies of the corrected book find it.
  const matchKey = changed.includes("title") || changed.includes("authors")
    ? { matchKey: workMatchKey(patch.title ?? work.title, (patch.authors ?? work.authors)[0]) }
    : {};
  await prisma.work.update({ where: { id }, data: { ...patch, ...matchKey, curatedFields: mergeCurated(work.curatedFields, changed) } });
  // One cover for the book: every edition takes it, like every reader's copy, except an edition a
  // librarian gave a cover of its own (an audiobook's square art, say).
  const curatedEditions = work.editions.filter((e) => e.curatedFields.includes("coverUrl")).map((e) => e.id);
  if (changed.includes("coverUrl") && patch.coverUrl) {
    await prisma.edition.updateMany({ where: { workId: id, NOT: { id: { in: curatedEditions } } }, data: { coverUrl: patch.coverUrl } });
  }
  const copies = await applyCopyUpdates(workCopyUpdates(work, patch), { workId: id, workKey: work.openLibraryKey, skipEditionIds: curatedEditions });
  await logStaffAction({
    actorId: actor.id, action: "work.edit", targetType: "work", targetId: id,
    before, after: { ...Object.fromEntries(changed.map((k) => [k, patch[k as keyof typeof patch] ?? null])), copies }, reason,
  });
  return { ok: true, value: { work: (await findStaffWork(id))!, copies } };
}

// A hand-typed work (neither Open Library nor Hardcover has it) gets a book page only once a librarian has
// checked it's a real book rather than someone's private note (lib/workPages.ts). Withdrawing takes the page
// down again; readers keep their copies either way.
export async function setWorkPage(actor: Actor, id: string, approve: boolean, reason?: string): Promise<StaffOutcome<StaffWork>> {
  if (!isObjectId(id)) return staffFail(404, "No book with that id.");
  const work = await findStaffWork(id);
  if (!work) return staffFail(404, "No book with that id.");
  if (work.openLibraryKey || work.hardcoverId) return staffFail(400, "This book already has a page from Open Library or Hardcover.");
  if (!!work.pageApprovedAt === approve) return { ok: true, value: work };
  await prisma.work.update({ where: { id }, data: { pageApprovedAt: approve ? new Date() : null } });
  await logStaffAction({
    actorId: actor.id, action: approve ? "work.page_approve" : "work.page_withdraw", targetType: "work", targetId: id,
    before: { pageApprovedAt: work.pageApprovedAt?.toISOString() ?? null }, after: { title: work.title }, reason,
  });
  return { ok: true, value: (await findStaffWork(id))! };
}

export async function fixEdition(actor: Actor, id: string, body: Record<string, unknown>, reason?: string): Promise<FixResult> {
  if (!isObjectId(id)) return staffFail(404, "No edition with that id.");
  const edition = await prisma.edition.findUnique({ where: { id }, select: { ...editionSelect, workId: true } });
  if (!edition) return staffFail(404, "No edition with that id.");
  const parsed = parseEditionFix(body);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const patch = parsed.patch;
  if ("coverUrl" in patch) {
    const cover = await catalogueCoverFrom(patch.coverUrl);
    if (!cover.ok) return staffFail(400, cover.error);
    patch.coverUrl = cover.url;
  }
  const changed = changedFields(edition, patch) as string[];
  const work = await findStaffWork(edition.workId);
  if (!work) return staffFail(404, "That edition has no book.");
  if (!changed.length) return { ok: true, value: { work, copies: { books: 0, listItems: 0, circles: 0 } } };

  const before = Object.fromEntries(changed.map((k) => [k, edition[k as keyof typeof edition]]));
  await prisma.edition.update({ where: { id }, data: { ...patch, curatedFields: mergeCurated(edition.curatedFields, changed) } });
  const copies = await applyCopyUpdates(editionCopyUpdates(edition, patch), { editionId: id });
  await logStaffAction({
    actorId: actor.id, action: "edition.edit", targetType: "edition", targetId: id,
    before, after: { ...Object.fromEntries(changed.map((k) => [k, patch[k as keyof typeof patch] ?? null])), copies }, reason,
  });
  return { ok: true, value: { work: (await findStaffWork(edition.workId))!, copies } };
}
