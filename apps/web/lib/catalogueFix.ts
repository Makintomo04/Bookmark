import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { DESCRIPTION_MAX } from "@/lib/openLibrary";
import { copyCoverToUploadThing, isOpenLibraryCoverUrl, mirrorCover } from "@/lib/covers";
import { uploadersOf } from "@/lib/uploads";
import { uploadThingKey } from "@/lib/uploadedImages";
import { logStaffAction } from "@/lib/staffLog";
import { refreshStaffReportNotices } from "@/lib/staffNotify";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { workMatchKey } from "@/lib/catalog/normalise";
import { openLibraryLookup } from "@/lib/catalog/lookup";
import { resolveCatalog } from "@/lib/catalog";
import { workIdForOpenLibraryKey } from "@/lib/catalog/prismaStore";
import { workKeyOfQuery } from "@/lib/workKey";
import { MERGED_PREFIX } from "@/lib/catalogueMergeRules";
import {
  EDITION_FIELDS,
  FIELD_LABELS,
  WORK_FIELDS,
  changedFields,
  closedReportIds,
  curatedAfterRevert,
  curatedWorkFields,
  editionCopyUpdates,
  mergeCurated,
  parseEditionFix,
  parseWorkFix,
  revertPlan,
  workCopyUpdates,
  type CopyUpdate,
  type EditionValues,
  type WorkValues,
} from "@/lib/catalogueFixRules";

// A librarian's correction to the shared catalogue, from /staff/catalogue or "Fix this book" on a book
// page. The rules (what may change, which readers' copies follow) are in lib/catalogueFixRules.ts.

const editionSelect = { id: true, key: true, format: true, pages: true, isbn13: true, isbn10: true, publisher: true, publishedYear: true, coverUrl: true, curatedFields: true } as const;
const workFields = {
  id: true, key: true, openLibraryKey: true, hardcoverId: true, pageApprovedAt: true, title: true, authors: true, description: true, coverUrl: true, seriesName: true, seriesPosition: true, firstPublishYear: true, curatedFields: true,
} as const;
// Every edition: most works have a handful, and a fix to the work's cover has to see them all.
const workSelect = { ...workFields, editions: { select: editionSelect, orderBy: { createdAt: "asc" } }, _count: { select: { books: true } } } as const;
// Search results only count the editions.
const hitSelect = { ...workFields, _count: { select: { books: true, editions: true } } } as const;

export type StaffWork = NonNullable<Awaited<ReturnType<typeof findStaffWork>>>;
export type StaffWorkHit = Awaited<ReturnType<typeof searchWorks>>[number];

export const findStaffWork = (id: string) => prisma.work.findUnique({ where: { id }, select: workSelect });

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oidOf = (row: unknown) => {
  const id = (row as { _id?: { $oid?: string } | string })?._id;
  return typeof id === "string" ? id : id?.$oid ?? null;
};

// Search by id, Open Library key (OL45883W), ISBN, title or author.
export async function searchWorks(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];
  if (isObjectId(q)) return prisma.work.findMany({ where: { id: q }, select: hitSelect });
  const digits = q.replace(/[^0-9Xx]/g, "");
  if (digits.length === 10 || digits.length === 13) {
    const editions = await prisma.edition.findMany({ where: { OR: [{ isbn13: digits }, { isbn10: digits.toUpperCase() }] }, select: { workId: true }, take: limit });
    if (editions.length) {
      return prisma.work.findMany({ where: { id: { in: Array.from(new Set(editions.map((e) => e.workId))) } }, select: hitSelect });
    }
  }
  const olKey = workKeyOfQuery(q);
  if (olKey) return prisma.work.findMany({ where: { openLibraryKey: olKey }, select: hitSelect, take: limit });
  // Prisma can't match part of one item in a list (authors), so the match runs in Mongo; a regex on an
  // array field matches any item. Title matches come first.
  const regex = { $regex: escapeRegex(q), $options: "i" };
  // A merged duplicate (lib/catalogueMergeRules.ts) is left out: its readers are on the book it went into.
  const rows = await prisma.work.aggregateRaw({
    pipeline: [
      { $match: { $or: [{ title: regex }, { authors: regex }], key: { $not: { $regex: `^${MERGED_PREFIX}` } } } },
      { $project: { _id: 1 } },
      { $limit: limit },
    ],
  });
  const ids = (rows as unknown as unknown[]).map(oidOf).filter((id): id is string => !!id);
  if (!ids.length) return [];
  const works = await prisma.work.findMany({ where: { id: { in: ids } }, select: hitSelect });
  const lower = q.toLowerCase();
  return works.sort((a, b) => Number(b.title.toLowerCase().includes(lower)) - Number(a.title.toLowerCase().includes(lower)));
}

// A book page can show a book straight from Open Library before any reader has shelved it, so it isn't
// in the catalogue yet and there's nothing to correct. This files it, the way a reader adding it would.
export async function addWorkFromOpenLibrary(actor: Actor, key: string): Promise<StaffOutcome<StaffWork>> {
  const olKey = workKeyOfQuery(key);
  if (!olKey) return staffFail(400, "That isn't an Open Library work id (like OL45883W).");
  // A key whose work was merged opens the book it went into (lib/catalogueMergeRules.ts).
  const existing = await workIdForOpenLibraryKey(olKey);
  if (existing) return { ok: true, value: (await findStaffWork(existing))! };
  const facts = await openLibraryLookup.work(olKey).catch(() => null);
  if (!facts?.title) return staffFail(404, `Open Library doesn't have a book at ${olKey}.`);
  const { work } = await resolveCatalog({ workKey: olKey, title: facts.title }, { lookup: true, describe: true });
  await logStaffAction({ actorId: actor.id, action: "work.add", targetType: "work", targetId: work.id, after: { openLibraryKey: olKey, title: work.title } });
  return { ok: true, value: (await findStaffWork(work.id))! };
}

// A book neither Open Library nor Hardcover has, typed in by a librarian: filed the way a reader's
// hand-typed copy is (lib/catalog/resolve.ts, by title and first author), with a book page straight away.
// A book already filed under that title and author is handed back instead, for the librarian to correct.
export async function createWorkByHand(actor: Actor, body: Record<string, unknown>): Promise<StaffOutcome<{ work: StaffWork; created: boolean }>> {
  const parsed = parseWorkFix({ title: body.title ?? "", authors: body.authors ?? "", ...pick(body, ["description", "coverUrl", "seriesName", "seriesPosition"]) }, DESCRIPTION_MAX);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const patch = parsed.patch as Partial<WorkValues> & { title: string; authors: string[] };
  const matchKey = workMatchKey(patch.title, patch.authors[0]);
  const existing = matchKey ? await prisma.work.findFirst({ where: { matchKey }, select: { id: true } }) : null;
  if (existing) return { ok: true, value: { work: (await findStaffWork(existing.id))!, created: false } };
  const cover = await catalogueCoverFrom(patch.coverUrl);
  if (!cover.ok) return staffFail(400, cover.error);

  const { work } = await resolveCatalog({
    title: patch.title, authors: patch.authors, author: patch.authors[0], description: patch.description, coverUrl: cover.url,
    series: patch.seriesName ? { name: patch.seriesName, position: patch.seriesPosition ?? null } : null,
  });
  const given = Object.keys(patch).filter((k) => patch[k as keyof WorkValues] != null);
  await prisma.work.update({ where: { id: work.id }, data: { pageApprovedAt: new Date(), curatedFields: curatedWorkFields(given) } });
  await logStaffAction({ actorId: actor.id, action: "work.create", targetType: "work", targetId: work.id, after: { title: patch.title, authors: patch.authors } });
  return { ok: true, value: { work: (await findStaffWork(work.id))!, created: true } };
}

const pick = (body: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in body).map((k) => [k, body[k]]));

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

type Copies = { books: number; listItems: number; circles: number };
export type FixResult = StaffOutcome<{ work: StaffWork; copies: Copies; reports?: number; reopened?: number }>;

type Actor = { id: string };

const noCopies: Copies = { books: 0, listItems: 0, circles: 0 };

// The reports a work fix closes: wrong covers and details, still open (unset reads as OPEN). A request to add a hand-typed book is answered
// by giving it a page (setWorkPage), not by correcting it.
// Escalated ones wait for an admin (lib/staffReportRules.ts mayActOnReport).
const fixableReports = (workId: string): Prisma.BookReportWhereInput => ({
  workId, reason: { not: "catalogue" }, OR: [{ status: { isSet: false } }, { status: null }, { status: "OPEN" }],
});

export const openReportCount = (workId: string) => prisma.bookReport.count({ where: fixableReports(workId) });

const FIXED_NOTE = "Fixed in the catalogue";

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
  if (!changed.length) return { ok: true, value: { work, copies: noCopies } };
  const wasCurated = curatedWorkFields(changed).filter((f) => work.curatedFields.includes(f));
  const copies = await applyWorkPatch(work, patch, changed);
  // Fixing the book answers readers' reports about it, so nobody has to go back to the queue to close them.
  // Their ids are logged, so reverting the fix reopens exactly these.
  const reportIds = (await prisma.bookReport.findMany({ where: fixableReports(id), select: { id: true } })).map((r) => r.id);
  const { count: reports } = reportIds.length
    ? await prisma.bookReport.updateMany({
      where: { id: { in: reportIds } },
      data: { status: "ACTIONED", resolvedById: actor.id, resolvedAt: new Date(), resolutionNote: FIXED_NOTE },
    })
    : { count: 0 };
  await logStaffAction({
    actorId: actor.id, action: "work.edit", targetType: "work", targetId: id,
    before: valuesOf(work, changed), after: { ...valuesOf(patch, changed), copies, wasCurated, ...(reports > 0 && { reports, reportIds }) }, reason,
  });
  // Staff's "N reports waiting" notices follow the queue.
  if (reports > 0) await refreshStaffReportNotices();
  return { ok: true, value: { work: (await findStaffWork(id))!, copies, reports } };
}

const valuesOf = (row: object, fields: string[]) =>
  Object.fromEntries(fields.map((k) => [k, (row as Record<string, unknown>)[k] ?? null])) as Prisma.InputJsonObject;

// The catalogue side of a work fix or revert: the row, its curatedFields, its editions' cover and readers' copies.
// A revert passes the curatedFields to end up with (curatedAfterRevert).
async function applyWorkPatch(work: StaffWork, patch: Partial<WorkValues>, changed: string[], revert = false, curated?: string[]) {
  const id = work.id;
  // A new title or first author files the work under a new match key (lib/catalog/resolve.ts), so later
  // readers' copies of the corrected book find it.
  const matchKey = changed.includes("title") || changed.includes("authors")
    ? { matchKey: workMatchKey(patch.title ?? work.title, (patch.authors ?? work.authors)[0]) }
    : {};
  await prisma.work.update({ where: { id }, data: { ...patch, ...matchKey, curatedFields: curated ?? mergeCurated(work.curatedFields, curatedWorkFields(changed)) } });
  // One cover for the book: every edition takes it, like every reader's copy, except an edition a
  // librarian gave a cover of its own (an audiobook's square art, say).
  const curatedEditions = work.editions.filter((e) => e.curatedFields.includes("coverUrl")).map((e) => e.id);
  if (changed.includes("coverUrl") && patch.coverUrl) {
    await prisma.edition.updateMany({ where: { workId: id, NOT: { id: { in: curatedEditions } } }, data: { coverUrl: patch.coverUrl } });
  } else if (revert && changed.includes("coverUrl") && work.coverUrl) {
    // Reverting to no cover: editions still showing the cover being undone lose it too.
    await prisma.edition.updateMany({ where: { workId: id, coverUrl: work.coverUrl, NOT: { id: { in: curatedEditions } } }, data: { coverUrl: null } });
  }
  return applyCopyUpdates(workCopyUpdates(work, patch, { revert }), { workId: id, workKey: work.openLibraryKey, skipEditionIds: curatedEditions });
}

// Undo a logged work.edit (or work.revert): see revertPlan in lib/catalogueFixRules.ts.
export async function revertWork(actor: Actor, id: string, actionId: unknown, reason?: string): Promise<FixResult> {
  if (!isObjectId(id)) return staffFail(404, "No book with that id.");
  const work = await findStaffWork(id);
  if (!work) return staffFail(404, "No book with that id.");
  const logged = await revertable(actionId, "work", id);
  if (!logged.ok) return logged;
  const plan = revertPlan(work, logged.value.before, logged.value.after, WORK_FIELDS);
  if (!plan.ok) return conflict(plan.conflicts);
  const patch = plan.patch as Partial<WorkValues>;
  const changed = changedFields(work, patch) as string[];
  if (!changed.length) return staffFail(400, "That edit didn't change anything that can be put back.");
  const reverted = curatedWorkFields(changed);
  const wasCurated = reverted.filter((f) => work.curatedFields.includes(f));
  const curated = curatedAfterRevert(work.curatedFields, reverted, (logged.value.after as { wasCurated?: unknown } | null)?.wasCurated);
  const copies = await applyWorkPatch(work, patch, changed, true, curated);
  const reopened = await reopenReports(actor, id, closedReportIds(logged.value.after), reason);
  await logStaffAction({
    actorId: actor.id, action: "work.revert", targetType: "work", targetId: id,
    before: valuesOf(work, changed), after: { ...valuesOf(patch, changed), copies, wasCurated, reverts: logged.value.id, ...(reopened > 0 && { reopened }) }, reason,
  });
  return { ok: true, value: { work: (await findStaffWork(id))!, copies, reopened } };
}

// The edit being reverted didn't fix what readers reported after all, so the reports it closed go back in
// the queue. Only those still closed as that fix left them: one someone has dealt with since stays.
async function reopenReports(actor: Actor, workId: string, reportIds: string[], reason?: string) {
  if (!reportIds.length) return 0;
  const still = (await prisma.bookReport.findMany({
    where: { id: { in: reportIds }, workId, status: "ACTIONED", resolutionNote: FIXED_NOTE }, select: { id: true },
  })).map((r) => r.id);
  if (!still.length) return 0;
  await prisma.bookReport.updateMany({ where: { id: { in: still } }, data: { status: "OPEN", resolvedById: null, resolvedAt: null, resolutionNote: null } });
  await refreshStaffReportNotices();
  await logStaffAction({
    actorId: actor.id, action: "report.reopen", targetType: "work", targetId: workId,
    before: { status: "ACTIONED" }, after: { status: "OPEN", reports: still.length, reportIds: still }, reason,
  });
  return still.length;
}

// An edit to this work or edition that can be undone: an edit or a revert, not undone already.
async function revertable(actionId: unknown, targetType: "work" | "edition", targetId: string) {
  if (typeof actionId !== "string" || !isObjectId(actionId)) return staffFail(404, "No edit with that id.");
  const action = await prisma.staffAction.findUnique({ where: { id: actionId } });
  if (!action || action.targetType !== targetType || action.targetId !== targetId || ![`${targetType}.edit`, `${targetType}.revert`].includes(action.action)) {
    return staffFail(404, "No edit with that id for this book.");
  }
  // Prisma can't filter on a field inside Json on Mongo; a book has few reverts.
  const reverts = await prisma.staffAction.findMany({ where: { action: `${targetType}.revert`, targetType, targetId }, select: { after: true } });
  if (reverts.some((r) => (r.after as { reverts?: string } | null)?.reverts === action.id)) return staffFail(409, "That edit has been reverted already.");
  return { ok: true as const, value: action };
}

const conflict = (fields: string[]) => staffFail(
  409,
  `Changed again since, so nothing was reverted: ${fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}. Correct ${fields.length === 1 ? "it" : "them"} by hand instead.`,
);

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
  // Readers' requests to add it (lib/staffReports.ts, reason "catalogue") are answered by the approval.
  if (approve) {
    await prisma.bookReport.updateMany({
      where: { workId: id, reason: "catalogue", OR: [{ status: { isSet: false } }, { status: null }, { status: { in: ["OPEN", "ESCALATED"] } }] },
      data: { status: "ACTIONED", resolvedById: actor.id, resolvedAt: new Date(), resolutionNote: "Given a book page" },
    });
  }
  await logStaffAction({
    actorId: actor.id, action: approve ? "work.page_approve" : "work.page_withdraw", targetType: "work", targetId: id,
    before: { pageApprovedAt: work.pageApprovedAt?.toISOString() ?? null }, after: { title: work.title }, reason,
  });
  return { ok: true, value: (await findStaffWork(id))! };
}

export async function fixEdition(actor: Actor, id: string, body: Record<string, unknown>, reason?: string): Promise<FixResult> {
  if (!isObjectId(id)) return staffFail(404, "No edition with that id.");
  const edition = await findEdition(id);
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
  if (!changed.length) return { ok: true, value: { work, copies: noCopies } };
  const taken = await isbnTaken(id, patch, changed);
  if (taken) return staffFail(409, taken);

  const wasCurated = changed.filter((f) => edition.curatedFields.includes(f));
  const copies = await applyEditionPatch(edition, patch, changed);
  await logStaffAction({
    actorId: actor.id, action: "edition.edit", targetType: "edition", targetId: id,
    before: valuesOf(edition, changed), after: { ...valuesOf(patch, changed), copies, wasCurated }, reason,
  });
  return { ok: true, value: { work: (await findStaffWork(edition.workId))!, copies } };
}

type EditionRow = NonNullable<Awaited<ReturnType<typeof findEdition>>>;
const findEdition = (id: string) => prisma.edition.findUnique({ where: { id }, select: { ...editionSelect, workId: true } });

async function applyEditionPatch(edition: EditionRow, patch: Partial<EditionValues>, changed: string[], curated?: string[]) {
  await prisma.edition.update({ where: { id: edition.id }, data: { ...patch, curatedFields: curated ?? mergeCurated(edition.curatedFields, changed) } });
  return applyCopyUpdates(editionCopyUpdates(edition, patch), { editionId: edition.id });
}

// Search and import find an edition by its ISBN (lib/catalog.ts), so two editions with one ISBN would
// send readers to whichever came first.
async function isbnTaken(id: string, patch: Partial<EditionValues>, changed: string[]) {
  for (const field of ["isbn13", "isbn10"] as const) {
    const isbn = patch[field];
    if (!changed.includes(field) || !isbn) continue;
    const other = await prisma.edition.findFirst({ where: { [field]: isbn, NOT: { id } }, select: { work: { select: { title: true } } } });
    if (other) return `Another edition already has that ${FIELD_LABELS[field]}, under ${other.work.title}.`;
  }
  return null;
}

export async function revertEdition(actor: Actor, id: string, actionId: unknown, reason?: string): Promise<FixResult> {
  if (!isObjectId(id)) return staffFail(404, "No edition with that id.");
  const edition = await findEdition(id);
  if (!edition) return staffFail(404, "No edition with that id.");
  const logged = await revertable(actionId, "edition", id);
  if (!logged.ok) return logged;
  const plan = revertPlan(edition, logged.value.before, logged.value.after, EDITION_FIELDS);
  if (!plan.ok) return conflict(plan.conflicts);
  const patch = plan.patch as Partial<EditionValues>;
  const changed = changedFields(edition, patch) as string[];
  if (!changed.length) return staffFail(400, "That edit didn't change anything that can be put back.");
  const taken = await isbnTaken(id, patch, changed);
  if (taken) return staffFail(409, taken);
  const wasCurated = changed.filter((f) => edition.curatedFields.includes(f));
  const curated = curatedAfterRevert(edition.curatedFields, changed, (logged.value.after as { wasCurated?: unknown } | null)?.wasCurated);
  const copies = await applyEditionPatch(edition, patch, changed, curated);
  await logStaffAction({
    actorId: actor.id, action: "edition.revert", targetType: "edition", targetId: id,
    before: valuesOf(edition, changed), after: { ...valuesOf(patch, changed), copies, wasCurated, reverts: logged.value.id }, reason,
  });
  return { ok: true, value: { work: (await findStaffWork(edition.workId))!, copies } };
}
