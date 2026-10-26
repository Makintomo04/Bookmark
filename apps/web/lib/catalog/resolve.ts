import { DESCRIPTION_MAX } from "../openLibrary.ts";
import { normaliseWorkKey } from "../workKey.ts";
import { newObjectId } from "../objectId.ts";
import { type EditionFormat, type Series, normaliseEditionKey, normaliseIsbns, titleAuthorKey } from "./normalise.ts";

// Find-or-create for the shared catalog (prisma/schema.prisma, Work and Edition), written against a
// small store interface so scripts/test/catalog.test.ts runs it in memory and lib/catalog.ts runs it on
// Prisma. Everything here is batch-shaped: an import step resolves 250 rows in a handful of queries.
//
// The rules it keeps:
//   - the same ISBN (in either form) or Open Library edition key always lands on one Edition;
//   - the same Open Library work key always lands on one Work, so two editions of a book share it;
//   - a book nobody could match is filed by normalised title + author, the way sameBook() compares;
//   - existing rows are only ever filled in (null fields), never overwritten, and a field a librarian
//     corrected (curatedFields, lib/catalogueFix.ts) is left alone even when it's empty.
//
// Kept free of "@/" imports so plain Node can load it.

export interface WorkRecord {
  id: string;
  key: string;
  openLibraryKey: string | null;
  title: string;
  authors: string[];
  authorKeys: string[];
  description: string | null;
  subjects: string[];
  seriesName: string | null;
  seriesPosition: number | null;
  coverUrl: string | null;
  firstPublishYear: number | null;
  curatedFields?: string[];
}

export interface EditionRecord {
  id: string;
  workId: string;
  key: string;
  openLibraryKey: string | null;
  isbn10: string | null;
  isbn13: string | null;
  format: EditionFormat | null;
  pages: number | null;
  audioMinutes: number | null;
  publisher: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  curatedFields?: string[];
}

// Everything a caller may know about a book. Only the title is required.
export interface CatalogInput {
  workKey?: string | null;
  editionKey?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  title: string;
  author?: string | null;
  authors?: string[] | null;
  authorKeys?: string[] | null;
  description?: string | null;
  subjects?: string[] | null;
  coverUrl?: string | null;
  // First published.
  year?: number | null;
  series?: Series | null;
  pages?: number | null;
  audioMinutes?: number | null;
  format?: EditionFormat | null;
  publisher?: string | null;
  publishedYear?: number | null;
}

// What Open Library says about a work or an edition. All optional: a lookup fills what it can.
export interface WorkFacts {
  workKey: string;
  title?: string | null;
  authors?: string[] | null;
  authorKeys?: string[] | null;
  description?: string | null;
  subjects?: string[] | null;
  coverUrl?: string | null;
  year?: number | null;
  pages?: number | null;
  series?: Series | null;
}

export interface EditionFacts {
  editionKey?: string | null;
  workKey?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  pages?: number | null;
  format?: EditionFormat | null;
  publisher?: string | null;
  publishedYear?: number | null;
  coverUrl?: string | null;
  series?: Series | null;
}

export interface CatalogLookup {
  // Several works in one request; no description.
  works(workKeys: string[]): Promise<Map<string, WorkFacts>>;
  // One work, with its description.
  work(workKey: string): Promise<WorkFacts | null>;
  isbn(isbn: string): Promise<EditionFacts | null>;
  // Title + author search, only accepting a plausible top hit.
  title(title: string, author: string | null): Promise<WorkFacts | null>;
}

export interface CatalogStore {
  findWorks(keys: string[]): Promise<WorkRecord[]>;
  getWorks(ids: string[]): Promise<WorkRecord[]>;
  findEditions(by: { keys: string[]; isbn13: string[]; isbn10: string[] }): Promise<EditionRecord[]>;
  // Insert rows (ids chosen by the caller). When another writer created the same key first, the
  // existing row comes back in its place, so callers never see a unique-key error.
  createWorks(rows: WorkRecord[]): Promise<WorkRecord[]>;
  createEditions(rows: EditionRecord[]): Promise<EditionRecord[]>;
  updateWork(id: string, patch: Partial<Omit<WorkRecord, "id" | "key">>): Promise<void>;
  updateEdition(id: string, patch: Partial<Omit<EditionRecord, "id" | "key" | "workId">>): Promise<void>;
}

export interface ResolveOptions {
  store: CatalogStore;
  // Without one, nothing is fetched: works and editions are built from the input alone.
  lookup?: CatalogLookup | null;
  // Search by title and author when there's no key or ISBN (the backfill). A request per such book.
  lookupTitle?: boolean;
  // Fetch a new work's description as well (the add-book route). One more request per new work.
  describe?: boolean;
  // Parallel lookups.
  concurrency?: number;
}

export interface Resolved {
  work: WorkRecord;
  edition: EditionRecord;
  // Whether the work is an Open Library work or a manual entry filed by title and author.
  matched: boolean;
}

export const SUBJECTS_MAX = 30;
const WORKS_PER_LOOKUP = 25;

const clean = (s?: string | null) => (s ?? "").trim() || null;
const positive = (n?: number | null) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null);
const cleanList = (list?: (string | null | undefined)[] | null, max = Infinity) =>
  Array.from(new Set((list ?? []).map((s) => (s ?? "").trim()).filter(Boolean))).slice(0, max);

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}

interface Item {
  input: CatalogInput;
  workKey: string | null;
  editionKey: string | null;
  isbn13: string | null;
  isbn10: string | null;
  workFacts: WorkFacts | null;
  editionFacts: EditionFacts | null;
  work: WorkRecord | null;
  edition: EditionRecord | null;
}

const authorsOf = (input: CatalogInput) => cleanList(input.authors?.length ? input.authors : [input.author]);

export const workKeyFor = (item: Pick<Item, "workKey" | "input">) =>
  item.workKey ? `ol:${item.workKey}` : `title:${titleAuthorKey(item.input.title, item.input.author ?? item.input.authors?.[0])}`;

export const editionKeyFor = (item: Pick<Item, "editionKey" | "isbn13" | "isbn10">, work: WorkRecord, format: EditionFormat | null, pages: number | null) =>
  item.editionKey ? `ol:${item.editionKey}`
  : item.isbn13 ? `isbn:${item.isbn13}`
  : item.isbn10 ? `isbn10:${item.isbn10}`
  : `generic:${work.id}:${format ?? "ANY"}:${pages ?? 0}`;

function workRow(item: Item): WorkRecord {
  const { input } = item;
  const facts = item.workFacts;
  const series = facts?.series ?? input.series ?? item.editionFacts?.series ?? null;
  return {
    id: newObjectId(),
    key: workKeyFor(item),
    openLibraryKey: item.workKey,
    title: clean(facts?.title) ?? input.title.trim(),
    authors: cleanList(facts?.authors?.length ? facts.authors : authorsOf(input)),
    authorKeys: cleanList(facts?.authorKeys?.length ? facts.authorKeys : input.authorKeys),
    description: clean(facts?.description ?? input.description)?.slice(0, DESCRIPTION_MAX) ?? null,
    subjects: cleanList(facts?.subjects?.length ? facts.subjects : input.subjects, SUBJECTS_MAX),
    seriesName: series?.name ?? null,
    seriesPosition: series?.position ?? null,
    coverUrl: clean(facts?.coverUrl ?? input.coverUrl ?? item.editionFacts?.coverUrl),
    firstPublishYear: positive(facts?.year ?? input.year),
  };
}

// The fields of `have` still unset that `want` can fill.
function fillIn<T extends { curatedFields?: string[] }>(have: T, want: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  const curated = new Set(have.curatedFields ?? []);
  for (const k of Object.keys(want) as (keyof T)[]) {
    if (curated.has(k as string)) continue;
    const current = have[k];
    const next = want[k];
    const empty = current === null || current === undefined || (Array.isArray(current) && current.length === 0);
    const useful = next !== null && next !== undefined && !(Array.isArray(next) && next.length === 0);
    if (empty && useful) patch[k] = next;
  }
  return patch;
}

function editionRow(item: Item, work: WorkRecord): EditionRecord {
  const { input } = item;
  const facts = item.editionFacts;
  const format = input.format ?? facts?.format ?? null;
  const pages = positive(input.pages ?? facts?.pages);
  return {
    id: newObjectId(),
    workId: work.id,
    key: editionKeyFor(item, work, format, pages),
    openLibraryKey: item.editionKey,
    isbn10: item.isbn10,
    isbn13: item.isbn13,
    format,
    pages,
    audioMinutes: positive(input.audioMinutes),
    publisher: clean(input.publisher ?? facts?.publisher),
    publishedYear: positive(input.publishedYear ?? facts?.publishedYear),
    coverUrl: clean(facts?.coverUrl ?? input.coverUrl ?? work.coverUrl),
  };
}

function prepare(input: CatalogInput): Item {
  const isbns = normaliseIsbns(input);
  return {
    input,
    workKey: normaliseWorkKey(input.workKey),
    editionKey: normaliseEditionKey(input.editionKey),
    isbn13: isbns.isbn13,
    isbn10: isbns.isbn10,
    workFacts: null,
    editionFacts: null,
    work: null,
    edition: null,
  };
}

function takeEditionFacts(item: Item, facts: EditionFacts) {
  item.editionFacts = { ...facts, ...item.editionFacts };
  item.editionKey ??= normaliseEditionKey(facts.editionKey);
  item.workKey ??= normaliseWorkKey(facts.workKey);
  const isbns = normaliseIsbns({ isbn13: item.isbn13 ?? facts.isbn13, isbn10: item.isbn10 ?? facts.isbn10 });
  item.isbn13 ??= isbns.isbn13;
  item.isbn10 ??= isbns.isbn10;
}

// Attaches existing editions to items, by edition key, then by ISBN in either form.
async function attachEditions(items: Item[], store: CatalogStore) {
  const pending = items.filter((i) => !i.edition);
  const keys = new Set<string>();
  const isbn13 = new Set<string>();
  const isbn10 = new Set<string>();
  for (const i of pending) {
    if (i.editionKey) keys.add(`ol:${i.editionKey}`);
    if (i.isbn13) {
      keys.add(`isbn:${i.isbn13}`);
      isbn13.add(i.isbn13);
    }
    if (i.isbn10) {
      keys.add(`isbn10:${i.isbn10}`);
      isbn10.add(i.isbn10);
    }
  }
  if (!keys.size) return;
  const found = await store.findEditions({ keys: Array.from(keys), isbn13: Array.from(isbn13), isbn10: Array.from(isbn10) });
  const byKey = new Map(found.map((e) => [e.key, e]));
  const by13 = new Map(found.flatMap((e) => (e.isbn13 ? [[e.isbn13, e] as const] : [])));
  const by10 = new Map(found.flatMap((e) => (e.isbn10 ? [[e.isbn10, e] as const] : [])));
  for (const i of pending) {
    i.edition =
      (i.editionKey && byKey.get(`ol:${i.editionKey}`)) ||
      (i.isbn13 && (by13.get(i.isbn13) || byKey.get(`isbn:${i.isbn13}`))) ||
      (i.isbn10 && (by10.get(i.isbn10) || byKey.get(`isbn10:${i.isbn10}`))) ||
      null;
  }
}

export async function resolveMany(inputs: CatalogInput[], opts: ResolveOptions): Promise<Resolved[]> {
  const { store, lookup } = opts;
  const concurrency = opts.concurrency ?? 4;
  const items = inputs.map(prepare);

  // 1. Editions already in the catalog, by key or ISBN. Their work is settled too.
  await attachEditions(items, store);

  // 2. Open Library, for what isn't: an ISBN tells us the edition and its work; failing that, a title search.
  if (lookup) {
    const byIsbn = items.filter((i) => !i.edition && !i.workKey && (i.isbn13 || i.isbn10));
    await pool(byIsbn, concurrency, async (i) => {
      const facts = await lookup.isbn((i.isbn13 ?? i.isbn10)!).catch(() => null);
      if (facts) takeEditionFacts(i, facts);
    });
    if (opts.lookupTitle) {
      const byTitle = items.filter((i) => !i.edition && !i.workKey && i.input.title.trim());
      await pool(byTitle, concurrency, async (i) => {
        const facts = await lookup.title(i.input.title, i.input.author ?? i.input.authors?.[0] ?? null).catch(() => null);
        if (facts) {
          i.workKey = normaliseWorkKey(facts.workKey);
          i.workFacts = facts;
        }
      });
    }
    // An ISBN lookup may have named an edition key another reader already filed.
    await attachEditions(items, store);
  }

  // 3. Works for everything still without an edition.
  const needWork = items.filter((i) => !i.edition);
  const workKeys = Array.from(new Set(needWork.map(workKeyFor)));
  const works = new Map((await store.findWorks(workKeys)).map((w) => [w.key, w]));
  const missing = Array.from(new Set(needWork.filter((i) => !works.has(workKeyFor(i)) && i.workKey && !i.workFacts).map((i) => i.workKey!)));
  if (lookup && missing.length) {
    const facts = new Map<string, WorkFacts>();
    for (let n = 0; n < missing.length; n += WORKS_PER_LOOKUP) {
      const chunk = missing.slice(n, n + WORKS_PER_LOOKUP);
      const found = await lookup.works(chunk).catch(() => new Map<string, WorkFacts>());
      found.forEach((f, k) => facts.set(k, f));
    }
    if (opts.describe) {
      await pool(missing, concurrency, async (key) => {
        const full = await lookup.work(key).catch(() => null);
        if (full) facts.set(key, { ...facts.get(key), ...full, workKey: key });
      });
    }
    for (const i of needWork) if (i.workKey && facts.has(i.workKey)) i.workFacts = facts.get(i.workKey)!;
  }
  const newWorks = new Map<string, WorkRecord>();
  for (const i of needWork) {
    const key = workKeyFor(i);
    if (!works.has(key) && !newWorks.has(key)) newWorks.set(key, workRow(i));
  }
  if (newWorks.size) {
    for (const w of await store.createWorks(Array.from(newWorks.values()))) works.set(w.key, w);
  }
  for (const i of needWork) {
    i.work = works.get(workKeyFor(i))!;
    // Fill in what an older row lacks (a description or cover the first reader didn't have).
    if (!newWorks.has(i.work.key)) {
      const { id: _id, key: _key, ...want } = workRow(i);
      const patch = fillIn(i.work, want);
      if (Object.keys(patch).length) {
        await store.updateWork(i.work.id, patch);
        Object.assign(i.work, patch);
      }
    }
  }

  // 4. Editions. Generic (no identifier) ones may already exist for this work and page count.
  const drafts = new Map<Item, EditionRecord>();
  for (const i of needWork) drafts.set(i, editionRow(i, i.work!));
  const draftKeys = Array.from(new Set(Array.from(drafts.values()).map((e) => e.key)));
  const existing = new Map((draftKeys.length ? await store.findEditions({ keys: draftKeys, isbn13: [], isbn10: [] }) : []).map((e) => [e.key, e]));
  const newEditions = new Map<string, EditionRecord>();
  drafts.forEach((draft) => {
    if (!existing.has(draft.key) && !newEditions.has(draft.key)) newEditions.set(draft.key, draft);
  });
  if (newEditions.size) {
    for (const e of await store.createEditions(Array.from(newEditions.values()))) existing.set(e.key, e);
  }
  drafts.forEach((draft, i) => { i.edition = existing.get(draft.key)!; });

  // 5. Works for the editions found in step 1, and fill-ins for editions that already existed.
  const workIds = Array.from(new Set(items.filter((i) => !i.work).map((i) => i.edition!.workId)));
  const byId = new Map((workIds.length ? await store.getWorks(workIds) : []).map((w) => [w.id, w]));
  for (const i of items) {
    i.work ??= byId.get(i.edition!.workId) ?? null;
    if (!i.work) throw new Error(`catalog: edition ${i.edition!.id} has no work`);
    const draftKey = drafts.get(i)?.key;
    if (draftKey && newEditions.has(draftKey)) continue;
    const { id: _id, key: _key, workId: _w, ...want } = editionRow(i, i.work);
    const patch = fillIn(i.edition!, want);
    if (Object.keys(patch).length) {
      await store.updateEdition(i.edition!.id, patch);
      Object.assign(i.edition!, patch);
    }
  }

  return items.map((i) => ({ work: i.work!, edition: i.edition!, matched: !!i.work!.openLibraryKey }));
}

export async function resolveOne(input: CatalogInput, opts: ResolveOptions): Promise<Resolved> {
  return (await resolveMany([input], opts))[0];
}
