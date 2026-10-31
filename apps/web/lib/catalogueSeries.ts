import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { curatedWorkFields, mergeCurated } from "@/lib/catalogueFixRules";
import {
  cleanReason,
  movedAnything,
  parseSeriesEdit,
  parseSeriesLog,
  REASON_NEEDED,
  seriesEditDiff,
  seriesKeyMoves,
  seriesRevertPlan,
  SERIES_BOOKS_MAX,
} from "@/lib/catalogueSeriesRules";
import { logIn, moveSeriesKeys, recentChanges, TX_OPTIONS, undoConflict, undoneAlready, unmoveSeriesKeys, type UndoOutcome } from "@/lib/catalogueUndo";
import { possiblySameSeries, seriesLooseKey } from "@/lib/series";

// /staff/catalogue/series: one place to fix a series, instead of each book's seriesName and
// seriesPosition one at a time. The rules are in lib/catalogueSeriesRules.ts.

type Actor = { id: string };

const SEARCH_LIMIT = 30;

export interface SeriesHit {
  name: string;
  books: number;
  // Other spellings that are possibly the same series (packages/shared/src/series.ts seriesLooseKey).
  alike: { name: string; books: number }[];
}

// Every series name in the catalogue with its book count. One group over an indexed field; there are far
// fewer series than works.
async function allSeriesNames() {
  const rows = await prisma.work.aggregateRaw({
    pipeline: [{ $match: { seriesName: { $exists: true, $nin: [null, ""] } } }, { $group: { _id: "$seriesName", books: { $sum: 1 } } }],
  });
  return (rows as unknown as { _id: string; books: number }[]).map((r) => ({ name: r._id, books: r.books }));
}

const withAlike = (all: { name: string; books: number }[]) => {
  const names = all.map((s) => s.name);
  const count = new Map(all.map((s) => [s.name, s.books]));
  return (s: { name: string; books: number }): SeriesHit => ({
    ...s,
    alike: possiblySameSeries(s.name, names).map((name) => ({ name, books: count.get(name) ?? 0 })),
  });
};

// Names containing the query, loosely ("stormlight" finds "The Stormlight Archive"). With no query, the
// series spelled more than one way, for tidying.
export async function searchSeries(query: string): Promise<SeriesHit[]> {
  const all = await allSeriesNames();
  const describe = withAlike(all);
  const q = query.trim().toLowerCase();
  const loose = seriesLooseKey(query);
  const found = q
    ? all.filter((s) => s.name.toLowerCase().includes(q) || (loose && seriesLooseKey(s.name).includes(loose))).map(describe)
    : all.map(describe).filter((s) => s.alike.length > 0);
  return found.sort((a, b) => b.books - a.books || a.name.localeCompare(b.name)).slice(0, SEARCH_LIMIT);
}

const bookSelect = { id: true, title: true, authors: true, coverUrl: true, seriesName: true, seriesPosition: true, curatedFields: true } as const;

// One series' books, in order, with its other spellings.
export async function seriesDetail(name: string) {
  const [works, all] = await Promise.all([
    prisma.work.findMany({ where: { seriesName: name }, select: bookSelect, take: SERIES_BOOKS_MAX }),
    allSeriesNames(),
  ]);
  const books = all.find((s) => s.name === name)?.books ?? works.length;
  return { ...withAlike(all)({ name, books }), works: sortBooks(works) };
}
export type SeriesDetail = Awaited<ReturnType<typeof seriesDetail>>;
export type SeriesBook = SeriesDetail["works"][number];

const sortBooks = <T extends { seriesPosition: number | null; title: string }>(works: T[]) =>
  works.slice().sort((a, b) => (a.seriesPosition ?? Infinity) - (b.seriesPosition ?? Infinity) || a.title.localeCompare(b.title));

// The books of another spelling, for "Merge into this series", or one book for "Add a book".
export const seriesBooksByName = (name: string) =>
  prisma.work.findMany({ where: { seriesName: name }, select: bookSelect, take: SERIES_BOOKS_MAX }).then(sortBooks);
export const seriesBookById = (id: string) => prisma.work.findUnique({ where: { id }, select: bookSelect });

export interface SeriesSaveResult {
  name: string;
  changed: number;
  follows: number;
}


// One Save, in one transaction with its log row: every changed work written and marked curated (so
// lib/seriesFill.ts leaves it), follows and Hardcover checks moved to a new name, and one series.edit in the
// log with each work's old and new series, place and curated fields, and what moved.
export async function saveSeries(actor: Actor, body: Record<string, unknown>): Promise<StaffOutcome<SeriesSaveResult>> {
  const parsed = parseSeriesEdit(body);
  if (!parsed.ok) return staffFail(400, parsed.error);
  const reason = cleanReason(body.reason);
  if (!reason) return staffFail(400, REASON_NEEDED);
  const edit = parsed.edit;
  const ids = [...edit.entries.map((e) => e.workId), ...edit.removed];
  return prisma.$transaction(async (db): Promise<StaffOutcome<SeriesSaveResult>> => {
    const rows = await db.work.findMany({
      where: { OR: [{ seriesName: { in: [edit.name, ...edit.merge] } }, { id: { in: ids } }] },
      select: { id: true, authors: true, seriesName: true, seriesPosition: true, curatedFields: true },
    });
    if (edit.entries.some((e) => !rows.some((r) => r.id === e.workId))) return staffFail(404, "One of those books isn't in the catalogue any more.");
    const changes = seriesEditDiff(rows, edit);
    if (!changes.length) return staffFail(400, "Nothing to save.");
    const byId = new Map(rows.map((r) => [r.id, r]));
    const curated = new Map(changes.map((c) => [c.id, mergeCurated(byId.get(c.id)!.curatedFields, curatedWorkFields(["seriesName", "seriesPosition"]))]));
    for (const c of changes) await db.work.update({ where: { id: c.id }, data: { ...c.after, curatedFields: curated.get(c.id) } });
    const moves = await moveSeriesKeys(db, seriesKeyMoves(changes.map((c) => {
      const author = byId.get(c.id)?.authors[0];
      return { before: { seriesName: c.before.seriesName, author }, after: { seriesName: c.after.seriesName, author } };
    })));
    const follows = moves.follows.moved.length;
    await logIn(db, {
      actorId: actor.id,
      action: "series.edit",
      targetType: "series",
      targetId: edit.rename,
      before: {
        name: edit.name,
        ...(edit.merge.length && { merged: edit.merge }),
        works: changes.map((c) => ({ id: c.id, ...c.before, curatedFields: byId.get(c.id)!.curatedFields })),
        ...(movedAnything(moves) && { moves }),
      } as unknown as Prisma.InputJsonValue,
      after: { name: edit.rename, works: changes.map((c) => ({ id: c.id, ...c.after, curatedFields: curated.get(c.id) })), ...(follows > 0 && { follows }) },
      reason,
    });
    return { ok: true, value: { name: edit.rename, changed: changes.length, follows } };
  }, TX_OPTIONS);
}

export interface SeriesUndoResult {
  // The series' name again, for reopening it in the editor.
  name: string | null;
  books: number;
  follows: number;
}

// Undo a logged save, all or nothing: every work goes back to its old series, place and curated fields,
// and follows and checks move back. Refused if any of the works has changed since.
export async function undoSeriesSave(actor: Actor, body: Record<string, unknown>): Promise<UndoOutcome<SeriesUndoResult>> {
  const actionId = typeof body.actionId === "string" && isObjectId(body.actionId) ? body.actionId : null;
  if (!actionId) return staffFail(404, "No series edit with that id.");
  const reason = cleanReason(body.reason);
  if (!reason) return staffFail(400, REASON_NEEDED);
  return prisma.$transaction(async (db): Promise<UndoOutcome<SeriesUndoResult>> => {
    const action = await db.staffAction.findUnique({ where: { id: actionId } });
    const log = action?.action === "series.edit" ? parseSeriesLog(action.before, action.after) : null;
    if (!action || !log) return staffFail(404, "No series edit with that id.");
    if (await undoneAlready(db, "series.revert", action.id)) return staffFail(409, "That edit has been undone already.");
    const current = await db.work.findMany({
      where: { id: { in: log.works.map((w) => w.id) } },
      select: { id: true, title: true, seriesName: true, seriesPosition: true, curatedFields: true },
    });
    const plan = seriesRevertPlan(log, current);
    if (!plan.ok) return undoConflict(plan.conflicts);
    for (const p of plan.patches) await db.work.update({ where: { id: p.id }, data: p.data });
    const follows = log.moves ? await unmoveSeriesKeys(db, log.moves) : 0;
    const name = (action.before as { name?: unknown } | null)?.name;
    await logIn(db, {
      actorId: actor.id,
      action: "series.revert",
      targetType: "series",
      targetId: typeof name === "string" ? name : action.targetId,
      before: { works: current.map((w) => ({ id: w.id, seriesName: w.seriesName, seriesPosition: w.seriesPosition, curatedFields: w.curatedFields })) },
      after: { reverts: action.id, ...(typeof name === "string" && { name }), works: plan.patches.map((p) => ({ id: p.id, ...p.data })), follows },
      reason,
    });
    return { ok: true, value: { name: typeof name === "string" ? name : null, books: plan.patches.length, follows } };
  }, TX_OPTIONS);
}

// The series tool's "Recent changes": "Mistborn → Mistborn Saga", or just the name when it kept it.
export const recentSeriesChanges = () =>
  recentChanges(["series.edit"], "series.revert", (r) => {
    const from = (r.before as { name?: unknown } | null)?.name;
    const to = (r.after as { name?: unknown } | null)?.name;
    if (r.action === "series.revert") return typeof to === "string" ? to : "";
    const merged = (r.before as { merged?: unknown } | null)?.merged;
    const names = [from, ...(Array.isArray(merged) ? merged : [])].filter((n): n is string => typeof n === "string");
    return typeof to === "string" && (names.length > 1 || names[0] !== to) ? `${names.join(", ")} → ${to}` : names[0] ?? "";
  });
