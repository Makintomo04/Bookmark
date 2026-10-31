import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { STAFF_ACTION_LABELS, type StaffActionInput } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { findStaffWork, type StaffWork } from "@/lib/catalogueFix";
import { FIELD_LABELS, WORK_FIELDS, revertPlan, type WorkValues } from "@/lib/catalogueFixRules";
import {
  MERGED_PREFIX,
  duplicatePairs,
  mergeCopies,
  mergeWorkValues,
  mergedInto,
  mergedKey,
  unmergeConflicts,
  unmergeCopyPatch,
  type CopyMerge,
  type CopyPatch,
  type CopyRow,
} from "@/lib/catalogueMergeRules";

// Merging duplicate works, undoing a merge, and moving an edition to another work (and back), from
// /staff/catalogue and its duplicates queue. The rules (which copy a reader keeps, what the survivor takes,
// when an undo is unsafe) are in lib/catalogueMergeRules.ts.
//
// Every row a merge or move changes is listed by id in the log's `before`, with the full row of each
// reader's copy it removed, so the undo puts exactly those back. Each runs in one transaction with its log
// row: a failure part way leaves everything as it was, and nothing is ever changed without the record an
// undo needs. The duplicate's Work row stays, marked merged by its key (catalogueMergeRules.ts mergedKey).

type Actor = { id: string };
type Tx = Prisma.TransactionClient;

// A popular book's merge touches thousands of copies, hence the longer timeout (like lib/accountDeletion.ts).
const TX = { timeout: 60_000, maxWait: 10_000 };

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// Merges, moves and their undos all need a reason for the log.
const NO_REASON = "Give a reason. It's kept in the staff log.";
const reasonOf = (reason: unknown) => (typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null);

// lib/staffLog.ts logStaffAction, inside the transaction, so the log row commits with the change or not at all.
const logIn = (tx: Tx, input: StaffActionInput) => tx.staffAction.create({ data: { ...input, reason: input.reason?.trim() || null } });

const mergeWorkSelect = {
  id: true, key: true, matchKey: true, openLibraryKey: true, title: true, authors: true, authorKeys: true, description: true,
  coverUrl: true, seriesName: true, seriesPosition: true, firstPublishYear: true, releaseDate: true, curatedFields: true,
} as const;

const copySelect = {
  id: true, userId: true, workId: true, workKey: true, editionId: true, status: true, rating: true, review: true, reviewSpoiler: true, reviewPrivate: true,
  reviewHiddenAt: true, ratingHiddenAt: true, isPrivate: true, timesRead: true, currentPage: true, startedAt: true, completedAt: true,
  tags: true, recommendedById: true, recommendedByName: true,
} as const;

type CopyLoaded = Prisma.BookGetPayload<{ select: typeof copySelect }>;

// Where a merged work's readers went: its survivor, following a merge of the survivor in turn. Null for a
// work that hasn't been merged. For a merged duplicate's book page to redirect.
export async function survivorOf(workId: string): Promise<{ id: string; openLibraryKey: string | null; title: string } | null> {
  let work = await prisma.work.findUnique({ where: { id: workId }, select: { id: true, key: true, openLibraryKey: true, title: true } });
  if (!work || !mergedInto(work.key)) return null;
  for (let hop = 0; hop < 5 && work && mergedInto(work.key); hop++) {
    work = await prisma.work.findUnique({ where: { id: mergedInto(work.key)! }, select: { id: true, key: true, openLibraryKey: true, title: true } });
  }
  return work && !mergedInto(work.key) ? { id: work.id, openLibraryKey: work.openLibraryKey, title: work.title } : null;
}

// A reader's copies on a work: by workId, and by Open Library key for any not yet given a workId.
function copiesOn(tx: Tx, work: { id: string; openLibraryKey: string | null }, userIds?: string[]) {
  return tx.book
    .findMany({
      where: { OR: [{ workId: work.id }, ...(work.openLibraryKey ? [{ workKey: work.openLibraryKey }] : [])], ...(userIds && { userId: { in: userIds } }) },
      select: copySelect,
    })
    .then((rows) => rows.filter((r) => r.workId === work.id || !r.workId));
}

const asCopyRow = (c: CopyLoaded, reads: Map<string, number>): CopyRow => ({ ...c, tags: c.tags ?? [], reads: reads.get(c.id) ?? 0 });

// The best of a reader's copies on one side, by the same measure mergeCopies uses.
const bestOf = (copies: CopyRow[]) => copies.reduce((best, c) => (mergeCopies(best, c).keep === c ? c : best));

// Readers with a copy on both sides: one fold each where their copies can become one with nothing lost
// (catalogueMergeRules.ts mergeCopies). The rest keep both copies, so a reader can end up with the book
// twice: better than losing a review, a rating or a read. keptBoth counts them for the result and the log.
async function pairCopies(tx: Tx, ours: CopyLoaded[], theirs: CopyLoaded[]) {
  const readCounts = await tx.bookRead.groupBy({ by: ["bookId"], where: { bookId: { in: [...ids(ours), ...ids(theirs)] } }, _count: { _all: true } });
  const reads = new Map(readCounts.map((r) => [r.bookId, r._count._all]));
  const byUser = (rows: CopyLoaded[]) => rows.reduce((m, c) => m.set(c.userId, [...(m.get(c.userId) ?? []), asCopyRow(c, reads)]), new Map<string, CopyRow[]>());
  const oursByUser = byUser(ours);
  const folds: CopyMerge[] = [];
  let keptBoth = 0;
  for (const [userId, mine] of byUser(theirs)) {
    const other = oursByUser.get(userId);
    if (!other) continue;
    const m = mergeCopies(bestOf(other), bestOf(mine));
    if (m.lost.length) keptBoth++;
    else folds.push(m);
  }
  return { folds, keptBoth };
}

// ---- Folding one reader's two copies into one --------------------------------------------------

type FoldMoved = Record<"reads" | "notes" | "activities" | "members" | "reviewReports" | "notifications" | "recaps", string[]>;
interface Folded { keptId: string; dropped: Record<string, unknown> & { id: string }; patch: CopyPatch; before: CopyPatch; moved: FoldMoved }

async function rowsOnCopy(tx: Tx, bookId: string): Promise<FoldMoved> {
  const where = { bookId };
  const select = { id: true } as const;
  return {
    reads: ids(await tx.bookRead.findMany({ where, select })),
    notes: ids(await tx.note.findMany({ where, select })),
    activities: ids(await tx.activity.findMany({ where, select })),
    members: ids(await tx.buddyReadMember.findMany({ where, select })),
    reviewReports: ids(await tx.reviewReport.findMany({ where, select })),
    notifications: ids(await tx.notification.findMany({ where, select })),
    recaps: ids(await tx.recap.findMany({ where, select })),
  };
}

// Moves the listed rows to another copy; with `from`, only those still on it.
async function moveRows(tx: Tx, moved: FoldMoved, from: string | null, to: string) {
  const where = (list: string[]) => ({ id: { in: list }, ...(from && { bookId: from }) });
  const data = { bookId: to };
  await tx.bookRead.updateMany({ where: where(moved.reads), data });
  await tx.note.updateMany({ where: where(moved.notes), data });
  await tx.activity.updateMany({ where: where(moved.activities), data });
  await tx.buddyReadMember.updateMany({ where: where(moved.members), data });
  await tx.reviewReport.updateMany({ where: where(moved.reviewReports), data });
  await tx.notification.updateMany({ where: where(moved.notifications), data });
  await tx.recap.updateMany({ where: where(moved.recaps), data });
}

// The dropped copy's reads, notes, activity and everything else pointing at it go to the kept copy, then
// it's removed. Its full row goes in the log, so an undo can put it back.
async function fold(tx: Tx, m: CopyMerge): Promise<Folded | null> {
  const row = await tx.book.findUnique({ where: { id: m.drop.id } });
  if (!row) return null;
  const moved = await rowsOnCopy(tx, m.drop.id);
  await moveRows(tx, moved, null, m.keep.id);
  if (Object.keys(m.patch).length) await tx.book.update({ where: { id: m.keep.id }, data: m.patch as Prisma.BookUpdateInput });
  await tx.book.delete({ where: { id: m.drop.id } });
  return { keptId: m.keep.id, dropped: json(row) as Folded["dropped"], patch: m.patch, before: m.before, moved };
}

// A folded copy comes back as it was, and takes back what moved from it onto the kept copy. Only rows
// still on the kept copy: one the reader has deleted since stays deleted.
async function unfold(tx: Tx, f: Folded, kept: CopyLoaded | undefined) {
  const exists = await tx.book.findUnique({ where: { id: f.dropped.id }, select: { id: true } });
  if (!exists) await tx.book.create({ data: f.dropped as unknown as Prisma.BookUncheckedCreateInput });
  await moveRows(tx, f.moved, f.keptId, f.dropped.id);
  const undo = kept ? unmergeCopyPatch(kept, f.patch, f.before) : {};
  if (Object.keys(undo).length) await tx.book.update({ where: { id: f.keptId }, data: undo as Prisma.BookUpdateInput });
}

// Copies back to the workId and Open Library key each had, grouped so each pair is one update. Only
// those still on `onWork`.
async function putBack(tx: Tx, books: { id: string; workId: string | null; workKey: string | null }[], onWork: string) {
  const groups = new Map<string, string[]>();
  for (const b of books) groups.set(JSON.stringify([b.workId, b.workKey]), [...(groups.get(JSON.stringify([b.workId, b.workKey])) ?? []), b.id]);
  for (const [pair, bookIds] of groups) {
    const [workId, workKey] = JSON.parse(pair) as [string | null, string | null];
    await tx.book.updateMany({ where: { id: { in: bookIds }, workId: onWork }, data: { workId, workKey } });
  }
}

// Prisma can't filter on a field inside Json on Mongo; a book is rarely undone more than once.
async function undoneAlready(tx: Tx, action: { id: string; targetId: string }, undo: "work.unmerge" | "edition.unmove") {
  const undos = await tx.staffAction.findMany({ where: { action: undo, targetId: action.targetId }, select: { after: true } });
  const field = undo === "work.unmerge" ? "unmerges" : "unmoves";
  return undos.some((u) => (u.after as Record<string, unknown> | null)?.[field] === action.id);
}

// ---- Merging -----------------------------------------------------------------------------------

export type MergeResult = StaffOutcome<{ work: StaffWork; moved: MergeCounts }>;
// keptBoth: readers who had the book on both and keep both copies, since folding would have lost something.
type MergeCounts = { editions: number; copies: number; folded: number; keptBoth: number; listItems: number; circles: number };

export async function mergeWorks(actor: Actor, duplicateId: string, intoId: unknown, reason: unknown): Promise<MergeResult> {
  if (!isObjectId(duplicateId)) return staffFail(404, "No book with that id.");
  if (typeof intoId !== "string" || !isObjectId(intoId)) return staffFail(400, "Choose the book to merge it into.");
  if (intoId === duplicateId) return staffFail(400, "A book can't be merged into itself.");
  const why = reasonOf(reason);
  if (!why) return staffFail(400, NO_REASON);

  const done = await prisma.$transaction(async (tx): Promise<StaffOutcome<MergeCounts>> => {
    const duplicate = await tx.work.findUnique({ where: { id: duplicateId }, select: mergeWorkSelect });
    const survivor = await tx.work.findUnique({ where: { id: intoId }, select: mergeWorkSelect });
    if (!duplicate) return staffFail(404, "No book with that id.");
    if (!survivor) return staffFail(404, "The book to merge into isn't in the catalogue.");
    if (mergedInto(duplicate.key)) return staffFail(409, "That book has been merged already.");
    if (mergedInto(survivor.key)) return staffFail(409, "The book to merge into has itself been merged. Choose the book it went into.");
    // Rows matched by Open Library key (list items, circles, unfiled copies) follow only to a survivor that has one.
    const fromKey = duplicate.openLibraryKey;
    const toKey = survivor.openLibraryKey;
    const rekey = !!fromKey && !!toKey && fromKey !== toKey;

    const dupCopies = await copiesOn(tx, duplicate);
    const survivorCopies = await copiesOn(tx, survivor, Array.from(new Set(dupCopies.map((c) => c.userId))));
    const { folds, keptBoth } = await pairCopies(tx, survivorCopies, dupCopies);
    const folded: Folded[] = [];
    for (const m of folds) {
      const f = await fold(tx, m);
      if (f) folded.push(f);
    }
    const dropped = new Set(folded.map((f) => f.dropped.id));

    // Everyone else's copies move as they are, both copies of a reader who keeps both among them. Each
    // keeps its edition, which moves with them below.
    const moving = dupCopies.filter((c) => !dropped.has(c.id));
    await tx.book.updateMany({ where: { id: { in: ids(moving) } }, data: { workId: survivor.id, ...(toKey && { workKey: toKey }) } });
    const editions = ids(await tx.edition.findMany({ where: { workId: duplicate.id }, select: { id: true } }));
    await tx.edition.updateMany({ where: { id: { in: editions } }, data: { workId: survivor.id } });
    const listItems = rekey ? ids(await tx.listItem.findMany({ where: { workKey: fromKey }, select: { id: true } })) : [];
    const circles = rekey ? ids(await tx.buddyRead.findMany({ where: { workKey: fromKey }, select: { id: true } })) : [];
    if (listItems.length) await tx.listItem.updateMany({ where: { id: { in: listItems } }, data: { workKey: toKey } });
    if (circles.length) await tx.buddyRead.updateMany({ where: { id: { in: circles } }, data: { workKey: toKey } });

    // One set of tags, one report and one recap per reader per work: a reader's row on the survivor stands and
    // theirs on the duplicate stays behind with it, where nothing reads it. Every other row moves.
    const readerTags = movable(
      await tx.readerTags.findMany({ where: { workId: duplicate.id }, select: { id: true, userId: true } }),
      await tx.readerTags.findMany({ where: { workId: survivor.id }, select: { userId: true } }),
      (r) => r.userId,
    );
    const bookReports = movable(
      await tx.bookReport.findMany({ where: { workId: duplicate.id }, select: { id: true, reporterId: true } }),
      await tx.bookReport.findMany({ where: { workId: survivor.id }, select: { reporterId: true } }),
      (r) => r.reporterId,
    );
    const recaps = movable(
      await tx.recap.findMany({ where: { workId: duplicate.id }, select: { id: true, userId: true, kind: true, bucket: true } }),
      await tx.recap.findMany({ where: { workId: survivor.id }, select: { userId: true, kind: true, bucket: true } }),
      (r) => `${r.userId}|${r.kind}|${r.bucket}`,
    );
    const notifications = ids(await tx.notification.findMany({ where: { workId: duplicate.id }, select: { id: true } }));
    const toSurvivor = { workId: survivor.id };
    await tx.readerTags.updateMany({ where: { id: { in: readerTags } }, data: toSurvivor });
    await tx.bookReport.updateMany({ where: { id: { in: bookReports } }, data: toSurvivor });
    await tx.recap.updateMany({ where: { id: { in: recaps } }, data: toSurvivor });
    await tx.notification.updateMany({ where: { id: { in: notifications } }, data: toSurvivor });

    // The survivor fills what it's missing from the duplicate. The duplicate is marked merged by its key, and
    // loses its match key, author keys and series, so neither resolving new copies nor author and series pages
    // find it. It keeps its Open Library key, which lib/catalog/resolve.ts follows to the survivor.
    const values = mergeWorkValues(survivor as WorkValues & { curatedFields: string[] }, duplicate as WorkValues & { curatedFields: string[] });
    const survivorBefore = Object.fromEntries(Object.keys(values.patch).map((k) => [k, survivor[k as keyof WorkValues] ?? null]));
    const curatedAdded = values.curatedFields.filter((f) => !survivor.curatedFields.includes(f));
    await tx.work.update({ where: { id: survivor.id }, data: { ...values.patch, curatedFields: values.curatedFields } });
    await tx.work.update({
      where: { id: duplicate.id },
      data: { key: mergedKey(survivor.id, duplicate.id), matchKey: null, authorKeys: [], seriesName: null, seriesPosition: null },
    });

    const moved: MergeCounts = { editions: editions.length, copies: moving.length, folded: folded.length, keptBoth, listItems: listItems.length, circles: circles.length };
    await logIn(tx, {
      actorId: actor.id, action: "work.merge", targetType: "work", targetId: duplicate.id,
      before: json({
        duplicate: { key: duplicate.key, matchKey: duplicate.matchKey, authorKeys: duplicate.authorKeys, seriesName: duplicate.seriesName, seriesPosition: duplicate.seriesPosition },
        survivor: survivorBefore,
        moved: {
          editions, books: moving.map((c) => ({ id: c.id, workId: c.workId, workKey: c.workKey })), listItems, circles,
          readerTags, bookReports, recaps, notifications,
        },
        folded,
      }),
      after: json({ intoId: survivor.id, title: duplicate.title, intoTitle: survivor.title, survivor: values.patch, curatedAdded, moved }),
      reason: why,
    });
    return { ok: true, value: moved };
  }, TX);
  if (!done.ok) return done;
  return { ok: true, value: { work: (await findStaffWork(intoId))!, moved: done.value } };
}

// The duplicate's rows that can move: those whose reader (or report, or recap) has none on the survivor.
const movable = <T extends { id: string }>(theirs: T[], ours: Omit<T, "id">[], keyOf: (r: Omit<T, "id">) => string) => {
  const taken = new Set(ours.map(keyOf));
  return theirs.filter((r) => !taken.has(keyOf(r))).map((r) => r.id);
};

interface MergeLog {
  duplicate: { key: string; matchKey: string | null; authorKeys: string[]; seriesName: string | null; seriesPosition: number | null };
  survivor: Record<string, unknown>;
  moved: {
    editions: string[]; books: { id: string; workId: string | null; workKey: string | null }[]; listItems: string[]; circles: string[];
    readerTags: string[]; bookReports: string[]; recaps: string[]; notifications: string[];
  };
  folded: Folded[];
}
interface MergeAfter { intoId: string; title?: string; intoTitle?: string; survivor: Record<string, unknown>; curatedAdded: string[] }

// Undo a logged merge: everything it moved goes back to the duplicate, folded copies come back with their
// reads, and the survivor loses what it filled in. Refused, with nothing changed, when that's no longer safe
// (catalogueMergeRules.ts unmergeConflicts). `id` is either book in the merge.
export async function unmergeWorks(actor: Actor, id: string, actionId: unknown, reason: unknown): Promise<StaffOutcome<{ work: StaffWork }>> {
  if (!isObjectId(id)) return staffFail(404, "No book with that id.");
  if (typeof actionId !== "string" || !isObjectId(actionId)) return staffFail(404, "No merge with that id.");
  const why = reasonOf(reason);
  if (!why) return staffFail(400, NO_REASON);

  const done = await prisma.$transaction(async (tx): Promise<StaffOutcome<null>> => {
    const action = await tx.staffAction.findUnique({ where: { id: actionId } });
    const after = action?.after as unknown as MergeAfter | null;
    if (!action || action.action !== "work.merge" || !after?.intoId || (action.targetId !== id && after.intoId !== id)) return staffFail(404, "No merge with that id for this book.");
    if (await undoneAlready(tx, action, "work.unmerge")) return staffFail(409, "That merge has been undone already.");
    const log = action.before as unknown as MergeLog;
    const duplicateId = action.targetId;
    const survivorId = after.intoId;

    const duplicate = await tx.work.findUnique({ where: { id: duplicateId }, select: mergeWorkSelect });
    const survivor = await tx.work.findUnique({ where: { id: survivorId }, select: mergeWorkSelect });
    if (!survivor) return staffFail(409, "The book it was merged into is no longer in the catalogue.");
    // lib/catalog/resolve.ts files the duplicate's Open Library key under the survivor, so a reader shelving
    // it since won't have recreated it; another work under the old key is a real clash.
    const keyHolder = duplicate ? await tx.work.findUnique({ where: { key: log.duplicate.key }, select: { id: true } }) : null;
    const editionsNow = await tx.edition.findMany({ where: { id: { in: log.moved.editions } }, select: { id: true, workId: true } });
    const booksNow = await tx.book.findMany({ where: { id: { in: log.moved.books.map((b) => b.id) } }, select: { id: true, workId: true } });
    const keptNow = await tx.book.findMany({ where: { id: { in: log.folded.map((f) => f.keptId) } }, select: copySelect });
    const plan = revertPlan(survivor, log.survivor, after.survivor, WORK_FIELDS);
    const problems = unmergeConflicts({
      duplicateMissing: !duplicate || mergedInto(duplicate.key) !== survivorId,
      keyTaken: !!keyHolder && keyHolder.id !== duplicateId,
      editionsElsewhere: editionsNow.filter((e) => e.workId !== survivorId).length,
      copiesElsewhere: booksNow.filter((b) => b.workId !== survivorId).length,
      keptRemoved: log.folded.length - keptNow.length,
      fieldConflicts: plan.ok ? [] : plan.conflicts,
    }, FIELD_LABELS);
    if (problems.length || !plan.ok || !duplicate) return staffFail(409, `Nothing was undone. ${problems.join(" ")}`);

    const fromKey = duplicate.openLibraryKey;
    const toKey = survivor.openLibraryKey;
    await tx.work.update({
      where: { id: duplicateId },
      data: { key: log.duplicate.key, matchKey: log.duplicate.matchKey, authorKeys: log.duplicate.authorKeys, seriesName: log.duplicate.seriesName, seriesPosition: log.duplicate.seriesPosition },
    });
    await tx.work.update({
      where: { id: survivorId },
      data: { ...(plan.patch as Partial<WorkValues>), curatedFields: survivor.curatedFields.filter((f) => !after.curatedAdded.includes(f)) },
    });
    await tx.edition.updateMany({ where: { id: { in: log.moved.editions }, workId: survivorId }, data: { workId: duplicateId } });
    await putBack(tx, log.moved.books, survivorId);
    if (fromKey && toKey) {
      await tx.listItem.updateMany({ where: { id: { in: log.moved.listItems }, workKey: toKey }, data: { workKey: fromKey } });
      await tx.buddyRead.updateMany({ where: { id: { in: log.moved.circles }, workKey: toKey }, data: { workKey: fromKey } });
    }
    const back = { workId: duplicateId };
    const onSurvivor = (list: string[]) => ({ id: { in: list }, workId: survivorId });
    await tx.readerTags.updateMany({ where: onSurvivor(log.moved.readerTags), data: back });
    await tx.bookReport.updateMany({ where: onSurvivor(log.moved.bookReports), data: back });
    await tx.recap.updateMany({ where: onSurvivor(log.moved.recaps), data: back });
    await tx.notification.updateMany({ where: onSurvivor(log.moved.notifications), data: back });

    const kept = new Map(keptNow.map((k) => [k.id, k]));
    for (const f of log.folded) await unfold(tx, f, kept.get(f.keptId));

    await logIn(tx, {
      actorId: actor.id, action: "work.unmerge", targetType: "work", targetId: duplicateId,
      after: { intoId: survivorId, unmerges: action.id, title: duplicate.title, intoTitle: survivor.title }, reason: why,
    });
    return { ok: true, value: null };
  }, TX);
  if (!done.ok) return done;
  return { ok: true, value: { work: (await findStaffWork(id))! } };
}

// ---- Moving an edition -------------------------------------------------------------------------

interface MoveLog { workId: string; title: string | null; books: { id: string; workId: string | null; workKey: string | null }[]; folded?: Folded[] }
interface MoveAfter { toWorkId: string; title?: string; fromWorkId: string; fromTitle?: string | null; copies?: number }

// One edition filed under the wrong book: it moves to the right one, with every reader's copy of it.
// Readers' copies on the book's other editions stay where they are. A reader who already has the book it's
// going to, on another edition, ends up with one copy when nothing is lost, or both (pairCopies).
export async function moveEdition(actor: Actor, id: string, toWorkId: unknown, reason: unknown): Promise<StaffOutcome<{ work: StaffWork; copies: number; folded: number; keptBoth: number }>> {
  if (!isObjectId(id)) return staffFail(404, "No edition with that id.");
  if (typeof toWorkId !== "string" || !isObjectId(toWorkId)) return staffFail(400, "Choose the book to move it to.");
  const why = reasonOf(reason);
  if (!why) return staffFail(400, NO_REASON);

  const done = await prisma.$transaction(async (tx): Promise<StaffOutcome<{ fromWorkId: string; copies: number; folded: number; keptBoth: number }>> => {
    const edition = await tx.edition.findUnique({ where: { id }, select: { id: true, workId: true } });
    if (!edition) return staffFail(404, "No edition with that id.");
    if (edition.workId === toWorkId) return staffFail(400, "The edition is already under that book.");
    const from = await tx.work.findUnique({ where: { id: edition.workId }, select: { id: true, title: true } });
    const to = await tx.work.findUnique({ where: { id: toWorkId }, select: { id: true, key: true, title: true, openLibraryKey: true } });
    if (!to) return staffFail(404, "The book to move it to isn't in the catalogue.");
    if (mergedInto(to.key)) return staffFail(409, "That book has been merged into another. Choose the book it went into.");

    const copies = await tx.book.findMany({ where: { editionId: id }, select: copySelect });
    const theirs = await tx.book.findMany({ where: { workId: to.id, userId: { in: Array.from(new Set(copies.map((c) => c.userId))) } }, select: copySelect });
    const { folds, keptBoth } = await pairCopies(tx, theirs, copies);
    const folded: Folded[] = [];
    for (const m of folds) {
      const f = await fold(tx, m);
      if (f) folded.push(f);
    }
    const dropped = new Set(folded.map((f) => f.dropped.id));
    const moving = copies.filter((c) => !dropped.has(c.id));
    await tx.edition.update({ where: { id }, data: { workId: to.id } });
    // Copies take the new book's Open Library key, so "read by people you follow" finds them under it.
    await tx.book.updateMany({ where: { id: { in: ids(moving) } }, data: { workId: to.id, ...(to.openLibraryKey && { workKey: to.openLibraryKey }) } });
    await logIn(tx, {
      actorId: actor.id, action: "edition.move", targetType: "edition", targetId: id,
      before: json({ workId: edition.workId, title: from?.title ?? null, books: moving.map((c) => ({ id: c.id, workId: c.workId, workKey: c.workKey })), folded }),
      after: { toWorkId: to.id, title: to.title, fromWorkId: edition.workId, fromTitle: from?.title ?? null, copies: moving.length + folded.length, folded: folded.length, keptBoth },
      reason: why,
    });
    return { ok: true, value: { fromWorkId: edition.workId, copies: moving.length + folded.length, folded: folded.length, keptBoth } };
  }, TX);
  if (!done.ok) return done;
  const { fromWorkId, ...counts } = done.value;
  return { ok: true, value: { work: (await findStaffWork(fromWorkId))!, ...counts } };
}

// Undo a logged move: the edition goes back, with the copies that moved with it, and copies folded on the
// way come back as they were. Refused, with nothing changed, when any of them has moved since. `workId` is
// the book the librarian is looking at, handed back as it is now.
export async function unmoveEdition(actor: Actor, id: string, actionId: unknown, reason: unknown, workId?: unknown): Promise<StaffOutcome<{ work: StaffWork; copies: number }>> {
  if (!isObjectId(id)) return staffFail(404, "No edition with that id.");
  if (typeof actionId !== "string" || !isObjectId(actionId)) return staffFail(404, "No move with that id.");
  const why = reasonOf(reason);
  if (!why) return staffFail(400, NO_REASON);

  const done = await prisma.$transaction(async (tx): Promise<StaffOutcome<{ fromWorkId: string; toWorkId: string; copies: number }>> => {
    const action = await tx.staffAction.findUnique({ where: { id: actionId } });
    const after = action?.after as unknown as MoveAfter | null;
    if (!action || action.action !== "edition.move" || action.targetId !== id || !after?.toWorkId) return staffFail(404, "No move with that id for this edition.");
    if (await undoneAlready(tx, action, "edition.unmove")) return staffFail(409, "That move has been undone already.");
    const log = action.before as unknown as MoveLog;
    const folded = log.folded ?? [];

    const edition = await tx.edition.findUnique({ where: { id }, select: { workId: true } });
    if (!edition) return staffFail(409, "The edition is no longer in the catalogue.");
    const origin = await tx.work.findUnique({ where: { id: log.workId }, select: { id: true, key: true, title: true } });
    if (!origin) return staffFail(409, "The book it came from is no longer in the catalogue.");
    if (mergedInto(origin.key)) return staffFail(409, "The book it came from has been merged since. Undo that first.");
    const booksNow = await tx.book.findMany({ where: { id: { in: log.books.map((b) => b.id) } }, select: { id: true, workId: true, editionId: true } });
    const keptNow = await tx.book.findMany({ where: { id: { in: folded.map((f) => f.keptId) } }, select: copySelect });
    const problems: string[] = [];
    if (edition.workId !== after.toWorkId) problems.push("The edition has moved to another book since. Undo that first.");
    const changed = booksNow.filter((b) => b.workId !== after.toWorkId || b.editionId !== id).length;
    if (changed) problems.push(`${changed === 1 ? "1 reader's copy has" : `${changed} readers' copies have`} changed book or edition since.`);
    const removed = folded.length - keptNow.length;
    if (removed) problems.push(`${removed === 1 ? "1 reader has" : `${removed} readers have`} removed the copy their other copy was folded into.`);
    if (problems.length) return staffFail(409, `Nothing was undone. ${problems.join(" ")}`);

    await tx.edition.update({ where: { id }, data: { workId: origin.id } });
    await putBack(tx, log.books, after.toWorkId);
    const kept = new Map(keptNow.map((k) => [k.id, k]));
    for (const f of folded) await unfold(tx, f, kept.get(f.keptId));
    const copies = log.books.length + folded.length;
    // Named as a move from where it was to where it came from, so the history finds it on both books.
    await logIn(tx, {
      actorId: actor.id, action: "edition.unmove", targetType: "edition", targetId: id,
      after: { unmoves: action.id, toWorkId: origin.id, title: origin.title, fromWorkId: after.toWorkId, fromTitle: after.title ?? null, copies },
      reason: why,
    });
    return { ok: true, value: { fromWorkId: after.toWorkId, toWorkId: origin.id, copies } };
  }, TX);
  if (!done.ok) return done;
  const shown = workId === done.value.fromWorkId ? done.value.fromWorkId : done.value.toWorkId;
  return { ok: true, value: { work: (await findStaffWork(shown))!, copies: done.value.copies } };
}

// ---- The book's history ------------------------------------------------------------------------

const MOVE_ACTIONS = ["work.merge", "work.unmerge", "edition.move", "edition.unmove"] as const;

const oidOf = (row: unknown) => {
  const id = (row as { _id?: { $oid?: string } | string })?._id;
  return typeof id === "string" ? id : id?.$oid ?? null;
};

// Merges and edition moves this book was part of, either side, and their undos, for its history in the work
// editor alongside its edits (lib/staffLog.ts bookHistory). The other book is named, and a merge or move
// says whether it has been undone.
export async function mergeHistory(workId: string) {
  if (!isObjectId(workId)) return [];
  // The other side of each is only in `before` and `after`, which only a raw query can filter on.
  const raw = await prisma.staffAction.findRaw({
    filter: { action: { $in: [...MOVE_ACTIONS] }, $or: [{ targetId: workId }, { "after.intoId": workId }, { "after.toWorkId": workId }, { "after.fromWorkId": workId }] },
    options: { projection: { _id: 1 }, sort: { createdAt: -1 }, limit: 30 },
  });
  const found = (raw as unknown as unknown[]).map(oidOf).filter((id): id is string => !!id);
  if (!found.length) return [];
  const rows = await prisma.staffAction.findMany({
    where: { id: { in: found } },
    select: { id: true, action: true, actorId: true, targetId: true, after: true, reason: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const undoable = rows.some((r) => r.action === "work.merge" || r.action === "edition.move");
  const undos = undoable
    ? await prisma.staffAction.findMany({ where: { action: { in: ["work.unmerge", "edition.unmove"] }, targetId: { in: rows.map((r) => r.targetId) } }, select: { after: true } })
    : [];
  const undone = new Set(undos.flatMap((u) => {
    const a = u.after as { unmerges?: string; unmoves?: string } | null;
    return [a?.unmerges, a?.unmoves].filter((id): id is string => !!id);
  }));
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.actorId))) } }, select: { id: true, username: true } });
  const username = new Map(users.map((u) => [u.id, u.username]));
  return rows.map((r) => {
    const after = (r.after ?? {}) as {
      intoId?: string; toWorkId?: string; fromWorkId?: string; fromTitle?: string; title?: string; intoTitle?: string; copies?: number; keptBoth?: number;
      moved?: { copies?: number; folded?: number; keptBoth?: number };
    };
    const kind = r.action === "work.merge" ? "merge" : r.action === "work.unmerge" ? "unmerge" : r.action === "edition.move" ? "move" : "unmove";
    const isMove = kind === "move" || kind === "unmove";
    // This book's side: for a merge, whether it was the duplicate or the survivor.
    const isDuplicate = !isMove && r.targetId === workId;
    const other = isMove
      ? (after.toWorkId === workId ? { id: after.fromWorkId ?? null, title: after.fromTitle ?? null } : { id: after.toWorkId ?? null, title: after.title ?? null })
      : isDuplicate ? { id: after.intoId ?? null, title: after.intoTitle ?? null } : { id: r.targetId, title: after.title ?? null };
    return {
      id: r.id,
      kind,
      label: STAFF_ACTION_LABELS[r.action as (typeof MOVE_ACTIONS)[number]],
      actor: username.get(r.actorId) ?? r.actorId,
      targetId: r.targetId,
      isDuplicate,
      // The edition the move is about, for its undo.
      editionId: isMove ? r.targetId : null,
      incoming: isMove && after.toWorkId === workId,
      other,
      copies: kind === "merge" ? (after.moved?.copies ?? 0) + (after.moved?.folded ?? 0) : after.copies ?? null,
      // Readers who kept both copies, since folding them would have lost something.
      keptBoth: kind === "merge" ? after.moved?.keptBoth ?? 0 : after.keptBoth ?? 0,
      undone: (kind === "merge" || kind === "move") && undone.has(r.id),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
export type MergeHistoryEntry = Awaited<ReturnType<typeof mergeHistory>>[number];

// ---- The duplicates queue ----------------------------------------------------------------------

const PAIRS_PAGE = 20;
const pairSelect = {
  id: true, key: true, title: true, authors: true, coverUrl: true, openLibraryKey: true, hardcoverId: true, firstPublishYear: true,
  _count: { select: { books: true, editions: true } },
} as const;

// Works filed under the same match key (catalogueMergeRules.ts duplicateKeyOf), a page of groups at a time,
// biggest groups first. Grouped in Mongo on the matchKey index, so only a page's works are loaded.
export async function duplicatesPage(page = 0) {
  const skip = Math.max(0, Math.floor(page)) * PAIRS_PAGE;
  const raw = await prisma.work.aggregateRaw({
    pipeline: [
      { $match: { matchKey: { $exists: true, $nin: [null, ""] }, key: { $not: { $regex: `^${MERGED_PREFIX}` } } } },
      { $group: { _id: "$matchKey", ids: { $push: "$_id" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1, _id: 1 } },
      { $facet: { total: [{ $count: "n" }], groups: [{ $skip: skip }, { $limit: PAIRS_PAGE }] } },
    ],
  });
  const facet = (raw as unknown as { total: { n: number }[]; groups: { ids: unknown[] }[] }[])[0];
  const groups = (facet?.groups ?? []).map((g) => g.ids.map((id) => oidOf({ _id: id })).filter((id): id is string => !!id));
  const works = await prisma.work.findMany({ where: { id: { in: groups.flat() } }, select: pairSelect });
  const byId = new Map(works.map((w) => [w.id, { ...w, readers: w._count.books }]));
  const pairs = groups.flatMap((g) => duplicatePairs(g.flatMap((id) => byId.get(id) ?? [])));
  const total = facet?.total[0]?.n ?? 0;
  return { pairs, total, page: Math.floor(skip / PAIRS_PAGE), more: skip + PAIRS_PAGE < total };
}
export type DuplicatesPage = Awaited<ReturnType<typeof duplicatesPage>>;
export type DuplicateWork = DuplicatesPage["pairs"][number][number];
