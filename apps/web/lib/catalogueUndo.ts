import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { STAFF_ACTION_LABELS, type StaffActionInput, type StaffActionKind } from "@/lib/staffLog";
import { staffAnswer, type StaffOutcome } from "@/lib/staffRoute";
import { conflictMessage, emptyMoveLog, shownConflicts, type SeriesKeyMove, type SeriesMoveLog } from "@/lib/catalogueSeriesRules";
import { seriesKey } from "@/lib/series";

// What author changes (lib/catalogueAuthors.ts) and series saves (lib/catalogueSeries.ts) share: running in
// one transaction with their log row, moving series follows and Hardcover checks to a new series key and
// back, and the tools' "Recent changes" list with Undo.

export type Db = Prisma.TransactionClient;

// Up to a thousand books, each with its readers' copies, in one go. Mongo's own limit on a transaction is
// 60 seconds, so this is as long as it can usefully be.
export const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

// lib/staffLog.ts logStaffAction, inside the transaction, so the change and its log row land together.
export const logIn = (db: Db, input: StaffActionInput) =>
  db.staffAction.create({ data: { ...input, reason: input.reason?.trim() || null } });

// A refused undo carries what has changed since, by title (the first ten), for the tool to list.
export type UndoOutcome<T> = StaffOutcome<T> | { ok: false; status: 409; error: string; conflicts: string[] };
export const undoConflict = (titles: string[]) => ({ ok: false, status: 409, error: conflictMessage(titles), conflicts: shownConflicts(titles) }) as const;

export function undoAnswer<T>(result: UndoOutcome<T>) {
  if (!result.ok && "conflicts" in result) return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: 409 });
  return staffAnswer(result);
}

// Prisma can't filter on a field inside Json on Mongo, so a raw query finds an undo of this action.
export async function undoneAlready(db: Db, revertKind: StaffActionKind, actionId: string) {
  const rows = await db.staffAction.findRaw({ filter: { action: revertKind, "after.reverts": actionId }, options: { projection: { _id: 1 }, limit: 1 } });
  return (rows as unknown as unknown[]).length > 0;
}

const unique = (list: string[]) => Array.from(new Set(list));

// Follows and checks are keyed by the series' name and first author (lib/series.ts seriesKey), so a new
// name or first author would leave them on a series nobody files books under. Each moves to the new key,
// but only once no book is left under the old one: one book moving into another series leaves the rest.
// A reader already following the new key keeps that follow, and the old one is dropped; likewise a check.
// Run after the works are written. Everything moved or dropped is returned for the log.
export async function moveSeriesKeys(db: Db, moves: SeriesKeyMove[]): Promise<SeriesMoveLog> {
  const log = emptyMoveLog();
  if (!moves.length) return log;
  const left = await db.work.findMany({ where: { seriesName: { in: unique(moves.map((m) => m.was)) } }, select: { seriesName: true, authors: true } });
  const still = new Set(left.flatMap((w) => (w.seriesName && w.authors[0] ? [seriesKey(w.seriesName, w.authors[0])] : [])));
  for (const m of moves.filter((m) => !still.has(m.from))) {
    const rows = await db.seriesFollow.findMany({ where: { seriesKey: m.from } });
    if (rows.length) {
      const already = new Set((await db.seriesFollow.findMany({ where: { seriesKey: m.to, userId: { in: rows.map((r) => r.userId) } }, select: { userId: true } })).map((r) => r.userId));
      const keep = rows.filter((r) => !already.has(r.userId));
      const drop = rows.filter((r) => already.has(r.userId));
      if (keep.length) await db.seriesFollow.updateMany({ where: { id: { in: keep.map((r) => r.id) } }, data: { seriesKey: m.to, name: m.name, author: m.author } });
      if (drop.length) await db.seriesFollow.deleteMany({ where: { id: { in: drop.map((r) => r.id) } } });
      log.follows.moved.push(...keep.map((r) => ({ id: r.id, from: m.from, to: m.to, name: r.name, author: r.author })));
      log.follows.dropped.push(...drop.map((r) => ({ userId: r.userId, seriesKey: r.seriesKey, name: r.name, author: r.author, createdAt: r.createdAt.toISOString() })));
    }
    const check = await db.seriesCheck.findUnique({ where: { seriesKey: m.from } });
    if (!check) continue;
    if (await db.seriesCheck.findUnique({ where: { seriesKey: m.to }, select: { id: true } })) {
      await db.seriesCheck.delete({ where: { id: check.id } });
      log.checks.dropped.push({
        seriesKey: check.seriesKey, name: check.name, author: check.author, hardcoverSeriesId: check.hardcoverSeriesId, highestPosition: check.highestPosition,
        announceAfter: check.announceAfter, checkedAt: check.checkedAt.toISOString(), createdAt: check.createdAt.toISOString(),
      });
    } else {
      await db.seriesCheck.update({ where: { id: check.id }, data: { seriesKey: m.to, name: m.name, author: m.author } });
      log.checks.moved.push({ id: check.id, from: m.from, to: m.to, name: check.name, author: check.author });
    }
  }
  return log;
}

// The reverse, for an undo. A follow still on the new key goes back, unless the reader has followed the old
// key again since (then this one just goes); dropped follows come back unless one is there already. Checks
// the same way.
export async function unmoveSeriesKeys(db: Db, log: SeriesMoveLog) {
  let follows = 0;
  for (const f of log.follows.moved) {
    const row = await db.seriesFollow.findUnique({ where: { id: f.id }, select: { userId: true, seriesKey: true } });
    if (!row || row.seriesKey !== f.to) continue;
    const taken = await db.seriesFollow.findUnique({ where: { userId_seriesKey: { userId: row.userId, seriesKey: f.from } }, select: { id: true } });
    if (taken) await db.seriesFollow.delete({ where: { id: f.id } });
    else await db.seriesFollow.update({ where: { id: f.id }, data: { seriesKey: f.from, name: f.name, author: f.author } });
    follows++;
  }
  // Not for an account deleted since.
  const users = new Set((await db.user.findMany({ where: { id: { in: unique(log.follows.dropped.map((d) => d.userId)) } }, select: { id: true } })).map((u) => u.id));
  for (const d of log.follows.dropped) {
    if (!users.has(d.userId)) continue;
    if (await db.seriesFollow.findUnique({ where: { userId_seriesKey: { userId: d.userId, seriesKey: d.seriesKey } }, select: { id: true } })) continue;
    await db.seriesFollow.create({ data: { ...d, createdAt: new Date(d.createdAt) } });
    follows++;
  }
  for (const c of log.checks.moved) {
    const row = await db.seriesCheck.findUnique({ where: { id: c.id }, select: { seriesKey: true } });
    if (!row || row.seriesKey !== c.to) continue;
    if (await db.seriesCheck.findUnique({ where: { seriesKey: c.from }, select: { id: true } })) continue;
    await db.seriesCheck.update({ where: { id: c.id }, data: { seriesKey: c.from, name: c.name, author: c.author } });
  }
  for (const d of log.checks.dropped) {
    if (await db.seriesCheck.findUnique({ where: { seriesKey: d.seriesKey }, select: { id: true } })) continue;
    await db.seriesCheck.create({ data: { ...d, checkedAt: new Date(d.checkedAt), createdAt: new Date(d.createdAt) } });
  }
  return follows;
}

export interface RecentChange {
  id: string;
  label: string;
  // "J.K. Rowling → J. K. Rowling".
  summary: string;
  actor: string;
  reason: string | null;
  createdAt: string;
  books: number;
  // An undo itself, or a change undone already: neither has an Undo button.
  isUndo: boolean;
  undone: boolean;
}

const RECENT = 10;
const revertsOf = (row: unknown) => {
  const id = (row as { after?: { reverts?: unknown } })?.after?.reverts;
  return typeof id === "string" ? id : null;
};

// The tool's last ten changes and undos, by anyone, newest first.
export async function recentChanges(
  kinds: StaffActionKind[],
  revertKind: StaffActionKind,
  summary: (row: { action: string; before: Prisma.JsonValue; after: Prisma.JsonValue }) => string,
): Promise<RecentChange[]> {
  const rows = await prisma.staffAction.findMany({ where: { action: { in: [...kinds, revertKind] } }, orderBy: { createdAt: "desc" }, take: RECENT });
  if (!rows.length) return [];
  const [undos, users] = await Promise.all([
    prisma.staffAction.findRaw({ filter: { action: revertKind, "after.reverts": { $in: rows.map((r) => r.id) } }, options: { projection: { after: 1 } } }),
    prisma.user.findMany({ where: { id: { in: unique(rows.map((r) => r.actorId)) } }, select: { id: true, username: true } }),
  ]);
  const undone = new Set((undos as unknown as unknown[]).map(revertsOf));
  const username = new Map(users.map((u) => [u.id, u.username]));
  return rows.map((r) => {
    const isUndo = r.action === revertKind;
    const works = (isUndo ? r.after : r.before) as { works?: unknown[] } | null;
    return {
      id: r.id,
      label: STAFF_ACTION_LABELS[r.action as StaffActionKind] ?? r.action,
      summary: summary(r),
      actor: username.get(r.actorId) ?? r.actorId,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      books: Array.isArray(works?.works) ? works.works.length : 0,
      isUndo,
      undone: undone.has(r.id),
    };
  });
}
