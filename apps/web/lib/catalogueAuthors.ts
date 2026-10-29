import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { authorStrings } from "@/lib/catalogueFixRules";
import { workMatchKey } from "@/lib/catalog/normalise";
import { authorSlug } from "@/lib/authorNames";
import { isObjectId } from "@/lib/staffUsers";
import {
  authorCurated,
  authorHits,
  authorRevertPlan,
  changeWorkAuthors,
  namesOf,
  parseAuthorChange,
  parseAuthorLog,
  type AuthorChange,
  type AuthorFields,
  type AuthorFollowLog,
  type AuthorHit,
} from "@/lib/catalogueAuthorRules";
import { cleanReason, movedAnything, REASON_NEEDED, seriesKeyMoves } from "@/lib/catalogueSeriesRules";
import { logIn, moveSeriesKeys, recentChanges, TX_OPTIONS, undoConflict, undoneAlready, unmoveSeriesKeys, type Db, type UndoOutcome } from "@/lib/catalogueUndo";

// /staff/catalogue/authors: find an author however the catalogue spells them, rename them, or merge
// spellings into one. The rules are in lib/catalogueAuthorRules.ts.

type Actor = { id: string };

// More than this in one go is better done as a script, where it can be checked first.
const WORKS_MAX = 1000;
const SEARCH_LIMIT = 30;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Distinct names on Work.authors containing the query, with book counts and the Open Library keys beside
// them. A key only counts where authorKeys is in step with authors (same length), since otherwise the key
// at that place could be a co-author's.
export async function searchAuthors(query: string): Promise<AuthorHit[]> {
  const q = query.trim();
  if (!q) return [];
  const regex = { $regex: escapeRegex(q), $options: "i" };
  const rows = await prisma.work.aggregateRaw({
    pipeline: [
      { $match: { authors: regex } },
      {
        $project: {
          authors: 1,
          keys: { $cond: [{ $eq: [{ $size: "$authors" }, { $size: { $ifNull: ["$authorKeys", []] } }] }, "$authorKeys", []] },
        },
      },
      { $unwind: { path: "$authors", includeArrayIndex: "at" } },
      { $match: { authors: regex } },
      { $group: { _id: "$authors", books: { $sum: 1 }, keys: { $addToSet: { $arrayElemAt: ["$keys", "$at"] } } } },
      { $sort: { books: -1 } },
      { $limit: SEARCH_LIMIT },
    ],
  });
  return authorHits((rows as unknown as { _id: string; books: number; keys?: unknown[] }[]).map((r) => ({ name: r._id, books: r.books, keys: r.keys })));
}

const bookSelect = { id: true, title: true, authors: true, authorKeys: true, coverUrl: true, seriesName: true, seriesPosition: true, _count: { select: { books: true } } } as const;

// The works carrying one name, for checking before a rename or merge.
export const authorWorks = (name: string) =>
  prisma.work.findMany({ where: { authors: { has: name } }, select: bookSelect, orderBy: { title: "asc" }, take: 200 });
export type AuthorWork = Awaited<ReturnType<typeof authorWorks>>[number];

const planSelect = { id: true, openLibraryKey: true, title: true, authors: true, authorKeys: true, curatedFields: true, seriesName: true } as const;
type PlanWork = Prisma.WorkGetPayload<{ select: typeof planSelect }>;
type Plan = { work: PlanWork; next: AuthorFields };

async function planChange(change: AuthorChange, db: Db = prisma): Promise<StaffOutcome<Plan[]>> {
  const works = await db.work.findMany({ where: { authors: { hasSome: namesOf(change) } }, select: planSelect, take: WORKS_MAX + 1 });
  if (works.length > WORKS_MAX) return staffFail(400, `That's more than ${WORKS_MAX} books. Ask a developer to run it as a script.`);
  const plans = works.flatMap((work) => {
    const next = changeWorkAuthors(work, change);
    return next ? [{ work, next }] : [];
  });
  if (!plans.length) return staffFail(400, "No books have that name.");
  return { ok: true, value: plans };
}

// Readers' copies still showing a work's old author line, the way a work fix finds them (lib/catalogueFix.ts).
const copiesWhere = (plans: Plan[]): Prisma.BookWhereInput => ({
  OR: plans.map((p) => ({ workId: p.work.id, author: { in: authorStrings(p.work.authors) } })),
});

export interface AuthorChangeCount {
  books: number;
  copies: number;
}

// "This changes N books and M readers' copies", before the librarian confirms.
export async function previewAuthorChange(body: Record<string, unknown>): Promise<StaffOutcome<AuthorChangeCount>> {
  const parsed = parseAuthorChange(body);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const plans = await planChange(parsed.change);
  if (!plans.ok) return plans;
  return { ok: true, value: { books: plans.value.length, copies: await prisma.book.count({ where: copiesWhere(plans.value) }) } };
}

export interface AuthorChangeResult extends AuthorChangeCount {
  listItems: number;
  circles: number;
  follows: number;
}

// The change, its follows and its log row in one transaction: a failure part way changes nothing.
export async function applyAuthorChange(actor: Actor, body: Record<string, unknown>): Promise<StaffOutcome<AuthorChangeResult>> {
  const parsed = parseAuthorChange(body);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const reason = cleanReason(body.reason);
  if (!reason) return staffFail(400, REASON_NEEDED);
  const change = parsed.change;
  return prisma.$transaction(async (db): Promise<StaffOutcome<AuthorChangeResult>> => {
    const plans = await planChange(change, db);
    if (!plans.ok) return plans;
    let copies = 0, listItems = 0, circles = 0;
    for (const { work, next } of plans.value) {
      // A new first author files the work under a new match key, as a work fix does.
      const matchKey = next.authors[0] !== work.authors[0] ? { matchKey: workMatchKey(work.title, next.authors[0]) } : {};
      await db.work.update({
        where: { id: work.id },
        data: { authors: next.authors, authorKeys: next.authorKeys, curatedFields: authorCurated(work.curatedFields, change), ...matchKey },
      });
      // Only copies still showing exactly the catalogue's old line: a reader who typed their own keeps it.
      if (next.authors.join(", ") === work.authors.join(", ")) continue;
      const from = authorStrings(work.authors);
      const to = next.authors.join(", ");
      copies += (await db.book.updateMany({ where: { workId: work.id, author: { in: from } }, data: { author: to } })).count;
      if (work.openLibraryKey) {
        listItems += (await db.listItem.updateMany({ where: { workKey: work.openLibraryKey, author: { in: from } }, data: { author: to } })).count;
        circles += (await db.buddyRead.updateMany({ where: { workKey: work.openLibraryKey, author: { in: from } }, data: { author: to } })).count;
      }
    }
    const authorFollows = change.kind === "merge" && change.key ? await moveAuthorFollows(db, change.keys.filter((k) => k !== change.key), change.key, change.to) : null;
    // A new first author is a new series key for each of their series.
    const moves = await moveSeriesKeys(db, seriesKeyMoves(plans.value.map(({ work, next }) => ({
      before: { seriesName: work.seriesName, author: work.authors[0] },
      after: { seriesName: work.seriesName, author: next.authors[0] },
    }))));
    const follows = (authorFollows?.moved.length ?? 0) + moves.follows.moved.length;
    // Enough to undo it (undoAuthorChange): each work's old and new names, keys and curated fields, and
    // every follow and series check moved or dropped.
    await logIn(db, {
      actorId: actor.id,
      action: change.kind === "rename" ? "author.rename" : "author.merge",
      targetType: "author",
      targetId: authorSlug(change.to),
      before: {
        names: namesOf(change),
        ...(change.kind === "merge" && { keys: change.keys }),
        works: plans.value.map(({ work }) => ({ id: work.id, authors: work.authors, authorKeys: work.authorKeys, curatedFields: work.curatedFields })),
        ...(authorFollows && { follows: authorFollows }),
        ...(movedAnything(moves) && { moves }),
      } as unknown as Prisma.InputJsonValue,
      after: {
        name: change.to,
        ...(change.kind === "merge" && { key: change.key }),
        works: plans.value.map(({ work, next }) => ({ id: work.id, authors: next.authors, authorKeys: next.authorKeys, curatedFields: authorCurated(work.curatedFields, change) })),
        copies: { books: copies, listItems, circles },
        ...(follows > 0 && { follows }),
      },
      reason,
    });
    return { ok: true, value: { books: plans.value.length, copies, listItems, circles, follows } };
  }, TX_OPTIONS);
}

// Readers following a merged-away key follow the one kept instead. Someone already following both keeps
// one; the other is logged whole so an undo can bring it back.
async function moveAuthorFollows(db: Db, fromKeys: string[], key: string, name: string): Promise<AuthorFollowLog> {
  const log: AuthorFollowLog = { moved: [], dropped: [] };
  if (!fromKeys.length) return log;
  const rows = await db.authorFollow.findMany({ where: { authorKey: { in: fromKeys } } });
  if (!rows.length) return log;
  const already = new Set((await db.authorFollow.findMany({ where: { authorKey: key, userId: { in: rows.map((r) => r.userId) } }, select: { userId: true } })).map((r) => r.userId));
  const moved = new Set<string>();
  const drop: string[] = [];
  for (const r of rows) {
    if (already.has(r.userId) || moved.has(r.userId)) {
      drop.push(r.id);
      log.dropped.push({ userId: r.userId, authorKey: r.authorKey, name: r.name, slug: r.slug, createdAt: r.createdAt.toISOString() });
    } else {
      await db.authorFollow.update({ where: { id: r.id }, data: { authorKey: key, name, slug: authorSlug(name) } });
      moved.add(r.userId);
      log.moved.push({ id: r.id, authorKey: r.authorKey, name: r.name, slug: r.slug });
    }
  }
  if (drop.length) await db.authorFollow.deleteMany({ where: { id: { in: drop } } });
  return log;
}

// The reverse: a moved follow goes back to its old key (or just goes, if the reader has followed that key
// again since), and a dropped one comes back unless the reader follows that key already.
async function unmoveAuthorFollows(db: Db, log: AuthorFollowLog) {
  let count = 0;
  for (const f of log.moved) {
    const row = await db.authorFollow.findUnique({ where: { id: f.id }, select: { userId: true } });
    if (!row) continue;
    const taken = await db.authorFollow.findUnique({ where: { userId_authorKey: { userId: row.userId, authorKey: f.authorKey } }, select: { id: true } });
    if (taken) await db.authorFollow.delete({ where: { id: f.id } });
    else await db.authorFollow.update({ where: { id: f.id }, data: { authorKey: f.authorKey, name: f.name, slug: f.slug } });
    count++;
  }
  // Not for an account deleted since.
  const users = new Set((await db.user.findMany({ where: { id: { in: log.dropped.map((d) => d.userId) } }, select: { id: true } })).map((u) => u.id));
  for (const d of log.dropped) {
    if (!users.has(d.userId)) continue;
    if (await db.authorFollow.findUnique({ where: { userId_authorKey: { userId: d.userId, authorKey: d.authorKey } }, select: { id: true } })) continue;
    await db.authorFollow.create({ data: { ...d, createdAt: new Date(d.createdAt) } });
    count++;
  }
  return count;
}

export interface AuthorUndoResult {
  books: number;
  copies: number;
  follows: number;
}

// Undo a logged rename or merge, all or nothing: every work goes back to its old names, keys and curated
// fields, readers' copies still showing the new line go back to the old one, and follows and series checks
// move back. Refused if any of the works has changed since.
export async function undoAuthorChange(actor: Actor, body: Record<string, unknown>): Promise<UndoOutcome<AuthorUndoResult>> {
  const actionId = typeof body.actionId === "string" && isObjectId(body.actionId) ? body.actionId : null;
  if (!actionId) return staffFail(404, "No author change with that id.");
  const reason = cleanReason(body.reason);
  if (!reason) return staffFail(400, REASON_NEEDED);
  return prisma.$transaction(async (db): Promise<UndoOutcome<AuthorUndoResult>> => {
    const action = await db.staffAction.findUnique({ where: { id: actionId } });
    const log = action && parseAuthorLog(action.action, action.before, action.after);
    if (!action || !log) return staffFail(404, "No author change with that id.");
    if (await undoneAlready(db, "author.revert", action.id)) return staffFail(409, "That change has been undone already.");
    const current = await db.work.findMany({
      where: { id: { in: log.works.map((w) => w.id) } },
      select: { id: true, title: true, authors: true, authorKeys: true, curatedFields: true, openLibraryKey: true },
    });
    const plan = authorRevertPlan(log, current);
    if (!plan.ok) return undoConflict(plan.conflicts);
    const byId = new Map(current.map((w) => [w.id, w]));
    let copies = 0;
    for (const p of plan.patches) {
      const work = byId.get(p.id)!;
      await db.work.update({
        where: { id: p.id },
        data: { authors: p.authors, authorKeys: p.authorKeys, curatedFields: p.curatedFields, ...(p.refile && { matchKey: workMatchKey(work.title, p.authors[0]) }) },
      });
      // Copies, list entries and circles still showing exactly the line the change wrote.
      if (!p.line) continue;
      const { from, to } = p.line;
      copies += (await db.book.updateMany({ where: { workId: p.id, author: from }, data: { author: to } })).count;
      if (work.openLibraryKey) {
        await db.listItem.updateMany({ where: { workKey: work.openLibraryKey, author: from }, data: { author: to } });
        await db.buddyRead.updateMany({ where: { workKey: work.openLibraryKey, author: from }, data: { author: to } });
      }
    }
    const follows = (log.follows ? await unmoveAuthorFollows(db, log.follows) : 0) + (log.moves ? await unmoveSeriesKeys(db, log.moves) : 0);
    await logIn(db, {
      actorId: actor.id,
      action: "author.revert",
      targetType: "author",
      targetId: action.targetId,
      before: { works: current.map((w) => ({ id: w.id, authors: w.authors, authorKeys: w.authorKeys, curatedFields: w.curatedFields })) },
      after: { reverts: action.id, names: (action.before as { names?: Prisma.JsonValue } | null)?.names ?? null, works: plan.patches.map((p) => ({ id: p.id, authors: p.authors, authorKeys: p.authorKeys, curatedFields: p.curatedFields })), copies, follows },
      reason,
    });
    return { ok: true, value: { books: plan.patches.length, copies, follows } };
  }, TX_OPTIONS);
}

const arrow = (from: unknown, to: unknown) => `${Array.isArray(from) ? from.join(", ") : "?"} → ${typeof to === "string" ? to : "?"}`;

// The authors tool's "Recent changes": "J.K. Rowling, Rowling, J.K. → J. K. Rowling", and an undo by the
// names it put back.
export const recentAuthorChanges = () =>
  recentChanges(["author.rename", "author.merge"], "author.revert", (r) => {
    if (r.action !== "author.revert") return arrow((r.before as { names?: unknown } | null)?.names, (r.after as { name?: unknown } | null)?.name);
    const names = (r.after as { names?: unknown } | null)?.names;
    return Array.isArray(names) ? names.join(", ") : "";
  });
