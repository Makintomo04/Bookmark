import { type CatalogInput, type CatalogLookup, type CatalogStore, resolveMany } from "./resolve.ts";
import { MemoryCatalogStore } from "./memoryStore.ts";
import { uploadThingKey } from "../uploadedImages.ts";

// Links existing shelf books to the shared catalog, batch by batch. Pure over two small interfaces so
// scripts/test/catalog.test.ts can prove it idempotent in memory; scripts/backfill-catalog.ts runs it
// on Prisma. Only workId and editionId are ever written to a book.

export interface BackfillBook {
  id: string;
  title: string;
  author: string;
  pages: number;
  coverImage: string;
  description: string | null;
  workKey: string | null;
  workId: string | null;
  editionId: string | null;
}

export interface BackfillSource {
  // Books with no work or edition yet, in a stable order, from after `afterId`.
  unlinked(afterId: string | null, take: number): Promise<BackfillBook[]>;
  link(bookId: string, ids: { workId: string; editionId: string }): Promise<void>;
}

export interface BackfillOptions {
  source: BackfillSource;
  store: CatalogStore;
  lookup?: CatalogLookup | null;
  dryRun?: boolean;
  batch?: number;
  limit?: number;
  log?: (line: string) => void;
  // Readers' uploads, by UploadThing file key (the Upload model). They stay on the reader's own copy, so
  // they never become a catalogue cover.
  uploadKeys?: Set<string>;
}

export interface BackfillSummary {
  seen: number;
  linked: number;
  // Filed under an Open Library work.
  matched: number;
  // Filed by title and author: nothing on Open Library (or no lookup). Listed in the log.
  unmatched: { id: string; title: string; author: string }[];
  failed: { id: string; title: string; error: string }[];
}

const OPEN_LIBRARY_COVER = "https://covers.openlibrary.org/";

// The book as the catalog should know it. The reader's cover is used when it has already been copied
// into our storage (any non-Open Library URL), unless it's their own upload; a hotlinked Open Library
// cover is left for the lookup to replace with the work's own.
export const backfillInput = (book: BackfillBook, uploadKeys: Set<string> = new Set()): CatalogInput => ({
  workKey: book.workKey,
  title: book.title,
  author: book.author,
  pages: book.pages > 0 ? book.pages : null,
  description: book.description,
  coverUrl: book.coverImage && !book.coverImage.startsWith(OPEN_LIBRARY_COVER) && !uploadKeys.has(uploadThingKey(book.coverImage) ?? "") ? book.coverImage : null,
});

// A dry run's store: reads see the real catalog, writes stay in memory, so the run reports exactly what
// a real one would do and leaves nothing behind.
function overlay(base: CatalogStore): CatalogStore {
  const mem = new MemoryCatalogStore();
  const merge = <T extends { key: string }>(real: T[], own: T[]) => {
    const keys = new Set(own.map((r) => r.key));
    return [...own, ...real.filter((r) => !keys.has(r.key))];
  };
  return {
    async findWorks(keys) {
      return merge(await base.findWorks(keys), await mem.findWorks(keys));
    },
    async findWorksByMatch(matchKeys) {
      return merge(await base.findWorksByMatch(matchKeys), await mem.findWorksByMatch(matchKeys));
    },
    async getWorks(ids) {
      return merge(await base.getWorks(ids), await mem.getWorks(ids));
    },
    // Merges only happen in the real catalogue.
    ...(base.findMergedWorks && { findMergedWorks: (keys: string[]) => base.findMergedWorks!(keys) }),
    async findEditions(by) {
      return merge(await base.findEditions(by), await mem.findEditions(by));
    },
    async createWorks(rows) {
      const real = new Map((await base.findWorks(rows.map((r) => r.key))).map((w) => [w.key, w]));
      return Promise.all(rows.map(async (row) => real.get(row.key) ?? (await mem.createWorks([row]))[0]));
    },
    async createEditions(rows) {
      const real = new Map((await base.findEditions({ keys: rows.map((r) => r.key), isbn13: [], isbn10: [] })).map((e) => [e.key, e]));
      return Promise.all(rows.map(async (row) => real.get(row.key) ?? (await mem.createEditions([row]))[0]));
    },
    async updateWork(id, patch) {
      await mem.updateWork(id, patch);
    },
    async updateEdition(id, patch) {
      await mem.updateEdition(id, patch);
    },
  };
}

export async function backfillCatalog(opts: BackfillOptions): Promise<BackfillSummary> {
  const { source, lookup } = opts;
  const store = opts.dryRun ? overlay(opts.store) : opts.store;
  const log = opts.log ?? (() => undefined);
  const batchSize = opts.batch ?? 200;
  const summary: BackfillSummary = { seen: 0, linked: 0, matched: 0, unmatched: [], failed: [] };
  let afterId: string | null = null;

  while (true) {
    const remaining = opts.limit === undefined ? batchSize : Math.min(batchSize, opts.limit - summary.seen);
    if (remaining <= 0) break;
    const books = await source.unlinked(afterId, remaining);
    if (!books.length) break;
    afterId = books[books.length - 1].id;
    summary.seen += books.length;

    let resolved;
    try {
      resolved = await resolveMany(books.map((b) => backfillInput(b, opts.uploadKeys)), { store, lookup, lookupTitle: !!lookup });
    } catch (err) {
      // A whole batch failing (database down) is worth stopping for; a re-run picks up where this left off.
      const error = err instanceof Error ? err.message : String(err);
      for (const b of books) summary.failed.push({ id: b.id, title: b.title, error });
      log(`batch failed after ${summary.seen - books.length} book(s): ${error}`);
      break;
    }

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const { work, edition, matched } = resolved[i];
      if (matched) summary.matched++;
      else {
        summary.unmatched.push({ id: book.id, title: book.title, author: book.author });
        log(`unmatched: ${book.id} "${book.title}" by ${book.author} (filed by title and author)`);
      }
      if (opts.dryRun) continue;
      try {
        await source.link(book.id, { workId: work.id, editionId: edition.id });
        summary.linked++;
      } catch (err) {
        summary.failed.push({ id: book.id, title: book.title, error: err instanceof Error ? err.message : String(err) });
      }
    }
    log(`${summary.seen} seen, ${summary.linked} linked, ${summary.matched} on Open Library, ${summary.unmatched.length} by title`);
  }
  return summary;
}
