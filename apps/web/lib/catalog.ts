import { openLibraryLookup } from "./catalog/lookup";
import { prismaCatalogStore } from "./catalog/prismaStore";
import { type CatalogInput, type Resolved, resolveMany, resolveOne } from "./catalog/resolve";
import { isShareableCover } from "./uploadedImages";
import { uploadersOf } from "./uploads";

// The shared catalog: find or create the Work and Edition a book belongs to, from an Open Library search
// hit (work key, maybe an edition key and ISBN), an ISBN, or a work key alone. Two readers adding the same
// ISBN get the same Edition; two editions of one book share one Work. The rules live in ./catalog/resolve.ts.
//
//   const { work, edition } = await resolveCatalog({ workKey, editionKey, isbn13, title, author, pages }, { lookup: true })
//
// `lookup` lets it ask Open Library about a work or ISBN it hasn't seen (a request or two per new work);
// without it, rows are built from the input alone, which is what bulk paths (import, backfill) want.

export type { CatalogInput, Resolved } from "./catalog/resolve";

export interface CatalogOptions {
  lookup?: boolean;
  // With lookup: also search by title and author for a book with no key or ISBN (the backfill).
  lookupTitle?: boolean;
  // With lookup: fetch a new work's description too (the add-book route).
  describe?: boolean;
}

const options = (opts: CatalogOptions) => ({
  store: prismaCatalogStore,
  lookup: opts.lookup ? openLibraryLookup : null,
  lookupTitle: opts.lookupTitle,
  describe: opts.describe,
});

// The catalogue is shared, so a reader's uploaded cover never goes into it: it stays on their own copy.
// Open Library's covers and our stored copies of them pass through.
async function withoutUploads(inputs: CatalogInput[]): Promise<CatalogInput[]> {
  const uploaders = await uploadersOf(inputs.map((i) => i.coverUrl));
  if (uploaders.size === 0) return inputs;
  return inputs.map((i) => (i.coverUrl && !isShareableCover(i.coverUrl, uploaders, null) ? { ...i, coverUrl: null } : i));
}

export async function resolveCatalog(input: CatalogInput, opts: CatalogOptions = {}): Promise<Resolved> {
  const [clean] = await withoutUploads([input]);
  return resolveOne(clean, options(opts));
}

export async function resolveCatalogMany(inputs: CatalogInput[], opts: CatalogOptions = {}): Promise<Resolved[]> {
  return resolveMany(await withoutUploads(inputs), options(opts));
}

// For write paths that must not fail over the catalog (saving a book, joining a buddy read): null and a
// warning instead of a throw. The book is saved without its links and the backfill picks it up later.
export async function linkCatalog(input: CatalogInput, opts: CatalogOptions = {}): Promise<Resolved | null> {
  try {
    return await resolveCatalog(input, opts);
  } catch (err) {
    console.warn(`catalog: couldn't resolve "${input.title}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

export const catalogIds = (resolved: Resolved | null) => ({
  workId: resolved?.work.id ?? null,
  editionId: resolved?.edition.id ?? null,
});
