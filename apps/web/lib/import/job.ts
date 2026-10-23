import prisma from "@/lib/db";
import { Prisma, type ImportJob, type Status } from "@prisma/client";
import { syncAchievements } from "@/lib/achievements";
import { isOpenLibraryCoverUrl, mirrorCover } from "@/lib/covers";
import { catalogIds, linkCatalog, resolveCatalogMany, type CatalogInput } from "@/lib/catalog";
import { normaliseWorkKey } from "@/lib/workKey";
import { isShareableCover } from "@/lib/uploadedImages";
import { uploadersOf } from "@/lib/uploads";
import { parseImport } from "./formats";
import { matchRows } from "./match";
import { llmAvailable, pickWithModel } from "./llmMatch";
import { ShelfIndex, buildRecords, findDuplicates, newObjectId, shelfKey, type BookInsert, type NoteInsert, type ReadInsert } from "./records";
import {
  type Decision, type Matches, type UncertainRow, applyModelOutcome, decide, modelPending, pendingForModel, uncertainRows, undatedFinished,
} from "./review";
import { type FileNotes, type ImportMatch, type ImportRow, type ImportSource, type MatchEntry, asMatch, effectiveMatch, isUncertain, isbnsFor } from "./types";

// The server half of an import: each exported step does a bounded amount of work and returns the
// job's new view, and the /import page calls the next step until the job is done. Every step is safe
// to retry: matching only looks up rows it hasn't, and inserting uses book ids fixed at upload.
//
// Matching has two phases under the one "matching" status: Open Library lookups for every row, then
// (when ANTHROPIC_API_KEY is set) a model pass over the rows those left uncertain, a few batches a step.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10_000;
// Each step stops starting new work after this, leaving room for the save under a 60s function limit.
const STEP_BUDGET_MS = 12_000;
const MATCH_BATCH = 150;
// Rows sent to the model per step (a few requests), so a step stays well inside its budget.
const MODEL_BATCH = 75;
const IMPORT_BATCH = 250;
const COVERS_PER_STEP = 5;

export type JobStatus = "matching" | "ready" | "importing" | "done" | "cancelled";

export interface ImportMedal {
  key: string;
  title: string;
  achievement: string;
}

// Kept on the job while importing, and as the summary afterwards.
export interface ImportResult {
  created: number;
  duplicates: number;
  byStatus: Partial<Record<Status, number>>;
  // Read dates (and added dates) span these years: "412 books, 9 years".
  firstYear: number | null;
  lastYear: number | null;
  // Imported without an Open Library match; the summary offers to fix them.
  unmatched: { bookId: string; title: string; author: string }[];
  medals: ImportMedal[];
  // Finished books whose file had no finish date: kept undated, not dated today.
  undatedFinished: number;
  // What the pre-cleaner set aside or had to decide about the file. Written at upload, kept to the end.
  file?: FileNotes;
  finishedAt?: string;
}

const emptyResult = (): ImportResult => ({
  created: 0,
  duplicates: 0,
  byStatus: {},
  firstYear: null,
  lastYear: null,
  unmatched: [],
  medals: [],
  undatedFinished: 0,
});

const rowsOf = (job: ImportJob) => (job.rows as unknown as ImportRow[]) ?? [];
const matchesOf = (job: ImportJob) => (job.matches as unknown as Matches) ?? {};
const resultOf = (job: ImportJob) => ({ ...emptyResult(), ...((job.result as unknown as ImportResult | null) ?? {}) });
const json = (value: unknown) => value as Prisma.InputJsonValue;

// A row is matched if Open Library found it (and the reader hasn't been left to check the match), or it
// arrived with a work key (Bookmark's own export).
const isMatched = (row: ImportRow, entry: MatchEntry | undefined) => !!(row.workKey || effectiveMatch(entry));

async function loadShelf(userId: string) {
  return prisma.book.findMany({ where: { userId }, select: { title: true, author: true, workKey: true } });
}

// ---- View --------------------------------------------------------------------------------

export interface ImportJobView {
  id: string;
  source: ImportSource;
  fileName: string | null;
  status: JobStatus;
  total: number;
  // Matching progress: rows looked up so far.
  looked: number;
  // Of the rows that will be imported (duplicates excluded):
  toImport: number;
  matched: number;
  unmatched: number;
  byStatus: Partial<Record<Status, number>>;
  duplicates: { shelf: number; file: number };
  // A few titles from each list, for the preview.
  samples: { unmatched: string[]; duplicates: string[] };
  imported: number;
  result: ImportResult | null;
  // After the import: books whose covers are still to be checked for copying.
  coversToCheck: number;
  // While matching: rows still waiting on the model (0 once that phase is over or skipped).
  checking: number;
  // Whether the model pass runs at all in this deployment.
  modelAvailable: boolean;
  // Before the import: matches scored too low to file without the reader's say-so.
  uncertain: UncertainRow[];
  // Finished books with no finish date in the file (before the import; `result` carries it after).
  undatedFinished: number;
  // What the pre-cleaner set aside or decided about the file.
  notes: FileNotes | null;
}

export async function viewJob(job: ImportJob): Promise<ImportJobView> {
  const rows = rowsOf(job);
  const matches = matchesOf(job);
  const status = job.status as JobStatus;
  const notes = (job.result as unknown as ImportResult | null)?.file ?? null;
  const base = {
    id: job.id,
    source: job.source as ImportSource,
    fileName: job.fileName,
    status,
    total: rows.length,
    looked: Object.keys(matches).length,
    imported: job.importCursor,
    result: job.result ? resultOf(job) : null,
    checking: 0,
    modelAvailable: llmAvailable(),
    uncertain: [] as UncertainRow[],
    undatedFinished: 0,
    notes,
  };

  if (status === "done" || status === "cancelled") {
    const result = resultOf(job);
    return {
      ...base,
      total: result.created + result.duplicates,
      looked: 0,
      toImport: result.created,
      matched: result.created - result.unmatched.length,
      unmatched: result.unmatched.length,
      byStatus: result.byStatus,
      duplicates: { shelf: result.duplicates, file: 0 },
      samples: { unmatched: [], duplicates: [] },
      coversToCheck: status === "done" ? Math.max(0, job.bookIds.length - job.coverCursor) : 0,
      undatedFinished: result.undatedFinished,
    };
  }

  const dupes = findDuplicates(rows, rows.map((_, i) => effectiveMatch(matches[i])), await loadShelf(job.userId));
  const byStatus: Partial<Record<Status, number>> = {};
  let matched = 0;
  let unmatched = 0;
  const samples = { unmatched: [] as string[], duplicates: [] as string[] };
  rows.forEach((row, i) => {
    if (dupes[i]) {
      if (samples.duplicates.length < 8) samples.duplicates.push(`${row.title} · ${row.author}`);
      return;
    }
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (isMatched(row, matches[i])) matched++;
    // Uncertain matches are listed in `uncertain`, not counted here, until the reader decides.
    else if (isUncertain(asMatch(matches[i]))) return;
    else if (String(i) in matches) {
      unmatched++;
      if (samples.unmatched.length < 8) samples.unmatched.push(`${row.title} · ${row.author}`);
    }
  });

  return {
    ...base,
    toImport: dupes.filter((d) => !d).length,
    matched,
    unmatched,
    byStatus,
    duplicates: { shelf: dupes.filter((d) => d === "shelf").length, file: dupes.filter((d) => d === "file").length },
    samples,
    coversToCheck: 0,
    checking: status === "matching" && llmAvailable() ? modelPending(matches) : 0,
    uncertain: status === "importing" ? [] : uncertainRows(rows, matches).filter((u) => !dupes[u.index]),
    undatedFinished: undatedFinished(rows.filter((_, i) => !dupes[i])),
  };
}

// ---- Upload ------------------------------------------------------------------------------

export async function createJob(userId: string, csvText: string, fileName: string | null) {
  const parsed = parseImport(csvText);
  if (parsed.rows.length === 0) throw new ImportInputError("That file has no books in it.");
  if (parsed.rows.length > MAX_ROWS) {
    throw new ImportInputError(`That file has ${parsed.rows.length.toLocaleString("en-GB")} books; the limit is ${MAX_ROWS.toLocaleString("en-GB")} per import.`);
  }

  // Only one import at a time. Abandoned ones (never confirmed) are dropped; finished ones keep their summary.
  await prisma.importJob.deleteMany({ where: { userId, status: { in: ["matching", "ready", "cancelled"] } } });
  const running = await prisma.importJob.findFirst({ where: { userId, status: "importing" }, select: { id: true } });
  if (running) throw new ImportInputError("An import is already running. Let it finish first.");

  // Bookmark's own export already carries work keys and covers, so those rows need no lookup.
  const matches: Matches = {};
  parsed.rows.forEach((row, i) => {
    if (row.workKey) matches[i] = null;
  });
  const now = Date.now();
  const job = await prisma.importJob.create({
    data: {
      userId,
      source: parsed.source,
      fileName,
      status: Object.keys(matches).length === parsed.rows.length ? "ready" : "matching",
      rows: json(parsed.rows),
      matches: json(matches),
      bookIds: parsed.rows.map(() => newObjectId(now)),
      // The pre-cleaner's notes ride on the result from the start, so the preview and the summary both have them.
      result: json({ ...emptyResult(), file: parsed.notes }),
    },
  });
  return job;
}

export class ImportInputError extends Error {}

export async function findJob(userId: string, jobId: string) {
  if (!/^[a-f0-9]{24}$/.test(jobId)) return null;
  return prisma.importJob.findFirst({ where: { id: jobId, userId } });
}

// The newest job that isn't finished, or one that finished in the last day (so a reload shows its summary).
export async function latestJob(userId: string) {
  const job = await prisma.importJob.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!job || job.status === "cancelled") return null;
  if (job.status === "done" && Date.now() - job.updatedAt.getTime() > 24 * 60 * 60 * 1000) return null;
  return job;
}

// ---- Matching ----------------------------------------------------------------------------

export async function matchStep(job: ImportJob) {
  if (job.status !== "matching") return job;
  const rows = rowsOf(job);
  const matches = matchesOf(job);
  const pending: number[] = [];
  for (let i = 0; i < rows.length && pending.length < MATCH_BATCH; i++) {
    if (!(String(i) in matches)) pending.push(i);
  }

  const deadline = Date.now() + STEP_BUDGET_MS;
  if (pending.length > 0) {
    const { matches: found } = await matchRows(rows, pending, { deadline });
    found.forEach((match, i) => {
      matches[i] = match;
    });
  }
  let done = rows.every((_, i) => String(i) in matches);

  // Phase two: the model chooses among the candidates for rows the lookups left unmatched. Without a
  // key (or after a failed request) every waiting row is marked skipped and the job is ready at once.
  if (done) {
    const waiting = pendingForModel(rows, matches);
    if (waiting.length > 0) {
      const outcome = await pickWithModel(waiting.slice(0, MODEL_BATCH), { deadline });
      if (outcome.status !== "done") console.warn(`import: model pass ${outcome.status}: ${outcome.reason ?? ""}`);
      applyModelOutcome(matches, outcome);
      done = modelPending(matches) === 0;
    }
  }

  return prisma.importJob.update({
    where: { id: job.id },
    data: { matches: json(matches), status: done ? "ready" : "matching" },
  });
}

// ---- Reviewing uncertain matches ---------------------------------------------------------

// One of the reader's one-tap decisions on a match the matcher wasn't sure of (lib/import/review.ts).
export async function decideStep(job: ImportJob, index: number, decision: Decision): Promise<{ job: ImportJob; error?: string }> {
  if (job.status !== "ready") return { job, error: "This import isn't at the review step." };
  const matches = matchesOf(job);
  if (index >= rowsOf(job).length) return { job, error: "That row isn't in this import." };
  const next = decide(matches[index], decision);
  if (next === undefined) return { job, error: "That book isn't waiting for a decision." };
  matches[index] = next;
  return { job: await prisma.importJob.update({ where: { id: job.id }, data: { matches: json(matches) } }) };
}

// ---- Importing ---------------------------------------------------------------------------

export async function startImport(job: ImportJob) {
  if (job.status !== "ready") return job;
  // The status guard makes a double click start one import, not two.
  const { count } = await prisma.importJob.updateMany({
    where: { id: job.id, status: "ready" },
    data: { status: "importing", importCursor: 0, result: json({ ...emptyResult(), file: resultOf(job).file }) },
  });
  return count ? prisma.importJob.findUniqueOrThrow({ where: { id: job.id } }) : job;
}

const yearOf = (d: Date | null | undefined) => (d ? d.getUTCFullYear() : null);

// What the catalog files a row under: the matched work (its own title and authors), the file's ISBNs,
// binding, publisher and year for the edition, and the row's title and author when nothing matched.
const catalogInput = (row: ImportRow, entry: MatchEntry | undefined, match: ImportMatch | null): CatalogInput => ({
  workKey: row.workKey ?? match?.workKey ?? null,
  // Not the file's ISBN when the lookups showed it belongs to another book (the catalog files by ISBN first).
  ...isbnsFor(row, entry),
  title: match?.title || row.title,
  author: row.author,
  authors: match?.authors?.length ? match.authors : [row.author],
  subjects: match?.subjects ?? null,
  coverUrl: row.coverUrl ?? match?.coverUrl ?? null,
  year: match?.year ?? null,
  series: row.series,
  pages: row.pages ?? match?.pages ?? null,
  format: row.format,
  publisher: row.publisher,
  publishedYear: row.publishedYear,
});

export async function importStep(job: ImportJob) {
  if (job.status !== "importing") return job;
  const rows = rowsOf(job);
  const matches = matchesOf(job);
  const result = resultOf(job);
  const start = job.importCursor;
  const end = Math.min(rows.length, start + IMPORT_BATCH);
  const ids = job.bookIds.slice(start, end);
  const now = new Date();
  const source = job.source as ImportSource;

  // Books from this batch that a previous, interrupted attempt already inserted.
  const already = new Set(
    (await prisma.book.findMany({ where: { id: { in: ids }, userId: job.userId }, select: { id: true } })).map((b) => b.id)
  );
  // Of those, the ones whose reads didn't make it in.
  const withReads = new Set(
    already.size
      ? (await prisma.bookRead.findMany({ where: { bookId: { in: Array.from(already) } }, select: { bookId: true }, distinct: ["bookId"] })).map((r) => r.bookId)
      : []
  );
  const shelf = new ShelfIndex(await loadShelf(job.userId));

  // File this batch's new books under the shared catalog in one pass (a handful of queries, no Open
  // Library calls: the match step already asked). Rows an interrupted attempt inserted keep their links.
  const toFile: number[] = [];
  for (let i = start; i < end; i++) if (!already.has(job.bookIds[i])) toFile.push(i);
  const filed = new Map<number, { workId: string; editionId: string }>();
  if (toFile.length) {
    try {
      const resolved = await resolveCatalogMany(toFile.map((i) => catalogInput(rows[i], matches[i], effectiveMatch(matches[i]))));
      toFile.forEach((i, n) => filed.set(i, { workId: resolved[n].work.id, editionId: resolved[n].edition.id }));
    } catch (err) {
      // The books still go in; scripts/backfill-catalog.ts links them later.
      console.warn("import: couldn't file this batch in the catalog:", err instanceof Error ? err.message : err);
    }
  }

  const books: BookInsert[] = [];
  const reads: ReadInsert[] = [];
  const notes: NoteInsert[] = [];
  const favourites: string[] = [];

  for (let i = start; i < end; i++) {
    const row = rows[i];
    // An uncertain match the reader never checked files as typed, never under the doubtful work.
    const match = effectiveMatch(matches[i]);
    const bookId = job.bookIds[i];
    const records = buildRecords(row, match, { userId: job.userId, bookId, now, source, catalog: filed.get(i) ?? null });

    if (already.has(bookId)) {
      if (!withReads.has(bookId)) reads.push(...records.reads);
    } else {
      const key = shelfKey(row, match);
      if (shelf.has(key)) {
        result.duplicates++;
        continue;
      }
      shelf.add(key);
      books.push(records.book);
      reads.push(...records.reads);
      notes.push(...records.notes);
      if (row.favourite) favourites.push(bookId);
    }

    result.created++;
    result.byStatus[row.status] = (result.byStatus[row.status] ?? 0) + 1;
    if (!isMatched(row, match)) result.unmatched.push({ bookId, title: row.title, author: row.author });
    if (row.status === "COMPLETED" && !row.completedAt) result.undatedFinished++;
    const dates = [records.book.createdAt, records.book.completedAt, ...records.reads.map((r) => r.finishedAt)];
    for (const year of dates.map(yearOf)) {
      if (year === null) continue;
      result.firstYear = result.firstYear === null ? year : Math.min(result.firstYear, year);
      result.lastYear = result.lastYear === null ? year : Math.max(result.lastYear, year);
    }
  }

  // A file can carry someone else's uploaded cover (a Bookmark export passed on). Uploads stay on the
  // uploader's own copy (lib/uploads.ts); these books show their title card instead.
  const uploaders = await uploadersOf(books.map((b) => b.coverImage));
  for (const book of books) {
    if (book.coverImage && uploaders.size && !isShareableCover(book.coverImage, uploaders, job.userId)) book.coverImage = "";
  }

  // No Activity rows: an import shouldn't post hundreds of "finished" updates to followers' feeds
  // (or count every past finish as a reading day for the streak).
  if (books.length) await prisma.book.createMany({ data: books });
  if (reads.length) await prisma.bookRead.createMany({ data: reads });
  if (notes.length) await prisma.note.createMany({ data: notes });
  if (favourites.length) await prisma.user.update({ where: { id: job.userId }, data: { favouriteIds: { push: favourites } } });

  const finished = end >= rows.length;
  const updated = await prisma.importJob.update({
    where: { id: job.id },
    data: { importCursor: end, result: json(result) },
  });
  return finished ? finishImport(updated) : updated;
}

// Awards achievements once, for the whole library, and clears the rows (they hold every review).
async function finishImport(job: ImportJob) {
  const result = resultOf(job);
  // "all" checks every ladder without recording today as a reading day. Notifications go out for the
  // highest new rung per ladder only, as for any other award.
  const { awarded } = await syncAchievements(job.userId, { trigger: "all" });
  result.medals = awarded.map((a) => ({
    key: `${a.achievement.key}:${a.milestone.value}`,
    title: a.milestone.title,
    achievement: a.achievement.title,
  }));
  result.finishedAt = new Date().toISOString();

  return prisma.importJob.update({
    where: { id: job.id },
    data: { status: "done", result: json(result), rows: json([]), matches: json({}) },
  });
}

export async function cancelJob(job: ImportJob) {
  if (job.status === "importing" || job.status === "done") return job;
  return prisma.importJob.update({ where: { id: job.id }, data: { status: "cancelled", rows: json([]), matches: json({}) } });
}

// ---- Covers ------------------------------------------------------------------------------

// Imported books hotlink Open Library covers, because copying one into UploadThing takes seconds.
// While the summary is open the page calls this to copy a few at a time; any left over keep working
// as hotlinks, and scripts/migrate-covers.ts copies them later.
// Walks bookIds in order with coverCursor, so a cover that fails to copy is passed over, not retried forever.
// Returns how many books are left to check.
export async function coversStep(job: ImportJob): Promise<number> {
  if (job.status !== "done") return 0;
  const ids = job.bookIds;
  let cursor = job.coverCursor;
  const picked: { id: string; coverImage: string; workId: string | null; editionId: string | null }[] = [];
  while (cursor < ids.length && picked.length < COVERS_PER_STEP) {
    const window = ids.slice(cursor, cursor + 100);
    const found = await prisma.book.findMany({
      where: { userId: job.userId, id: { in: window }, coverImage: { startsWith: "https://covers.openlibrary.org/" } },
      select: { id: true, coverImage: true, workId: true, editionId: true },
    });
    const order = new Map(window.map((id, i) => [id, i]));
    found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    const take = found.slice(0, COVERS_PER_STEP - picked.length);
    picked.push(...take);
    cursor = take.length < found.length ? cursor + order.get(take[take.length - 1].id)! + 1 : cursor + window.length;
  }

  await Promise.all(
    picked.map(async (book) => {
      // Falls back to the original URL on failure, which leaves the book as it was.
      const copy = await mirrorCover(book.coverImage);
      if (copy === book.coverImage) return;
      // The where clause skips a book whose cover the reader changed meanwhile. The catalog rows that
      // hotlink the same cover take the copy too.
      await Promise.all([
        prisma.book.updateMany({ where: { id: book.id, coverImage: book.coverImage }, data: { coverImage: copy } }),
        book.editionId && prisma.edition.updateMany({ where: { id: book.editionId, coverUrl: book.coverImage }, data: { coverUrl: copy } }),
        book.workId && prisma.work.updateMany({ where: { id: book.workId, coverUrl: book.coverImage }, data: { coverUrl: copy } }),
      ]);
    })
  );
  await prisma.importJob.update({ where: { id: job.id }, data: { coverCursor: cursor } });
  return ids.length - cursor;
}

// ---- Fixing unmatched rows ---------------------------------------------------------------

// Points an imported book at the Open Library work the reader picked, or keeps it as a manual entry.
export async function resolveUnmatched(
  job: ImportJob,
  input: { bookId: string; keep: true } | { bookId: string; keep?: false; workKey: string; coverUrl?: string | null; pages?: number | null }
): Promise<{ job: ImportJob; error?: string }> {
  const result = resultOf(job);
  const entry = result.unmatched.find((u) => u.bookId === input.bookId);
  if (!entry) return { job, error: "That book isn't waiting for a match." };

  if (!input.keep) {
    const workKey = normaliseWorkKey(input.workKey);
    if (!workKey) return { job, error: "That isn't an Open Library work." };
    const book = await prisma.book.findFirst({ where: { id: input.bookId, userId: job.userId } });
    if (!book) return { job, error: "That book isn't on your shelf any more." };
    const clash = await prisma.book.findFirst({ where: { userId: job.userId, workKey, id: { not: book.id } }, select: { title: true } });
    if (clash) return { job, error: `"${clash.title}" is already on your shelf as that book.` };
    const cover = input.coverUrl && isOpenLibraryCoverUrl(input.coverUrl) ? await mirrorCover(input.coverUrl) : null;
    // Re-file the book under the work the reader picked (it was filed by title and author).
    const filed = await linkCatalog(
      { workKey, title: book.title, author: book.author, pages: input.pages ?? book.pages, coverUrl: cover ?? input.coverUrl ?? null },
      { lookup: true, describe: true },
    );
    await prisma.book.update({
      where: { id: book.id },
      data: {
        workKey,
        ...(filed && catalogIds(filed)),
        ...(filed?.work.description && !book.description && { description: filed.work.description }),
        ...(cover && !book.coverImage && { coverImage: cover }),
        ...(cover && book.coverImage && isOpenLibraryCoverUrl(book.coverImage) && { coverImage: cover }),
        // Only fill in a page count the file didn't have; progress may depend on the reader's own.
        ...(!book.pages && input.pages && input.pages > 0 && {
          pages: input.pages,
          ...(book.status === "COMPLETED" && { currentPage: input.pages }),
        }),
      },
    });
  }

  result.unmatched = result.unmatched.filter((u) => u.bookId !== input.bookId);
  const updated = await prisma.importJob.update({ where: { id: job.id }, data: { result: json(result) } });
  return { job: updated };
}
