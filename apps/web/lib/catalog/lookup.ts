import { editionByIsbn, workDescription, worksByKeys } from "../openLibrary.ts";
import { matchTitle } from "../import/match.ts";
import type { CatalogLookup, EditionFacts, WorkFacts } from "./resolve.ts";
import { formatFrom, seriesFromOpenLibrary, yearFrom } from "./normalise.ts";
import { releaseDateFrom } from "@bookmark/shared/releases";

// The CatalogLookup over Open Library (lib/openLibrary.ts). Every call may throw; the resolver treats a
// failed lookup as "nothing known" and files the book from what the caller gave it.

export const openLibraryLookup: CatalogLookup = {
  async works(workKeys) {
    const found = await worksByKeys(workKeys);
    const facts = new Map<string, WorkFacts>();
    found.forEach((w, key) => facts.set(key, { ...w }));
    return facts;
  },

  async work(workKey) {
    const [found, description] = await Promise.all([worksByKeys([workKey]), workDescription(workKey).catch(() => null)]);
    const work = found.get(workKey);
    if (!work && !description) return null;
    return { ...(work ?? {}), workKey, description };
  },

  async isbn(isbn) {
    const edition = await editionByIsbn(isbn);
    if (!edition) return null;
    const facts: EditionFacts = {
      editionKey: edition.editionKey,
      workKey: edition.workKey,
      isbn13: edition.isbn13,
      isbn10: edition.isbn10,
      pages: edition.pages,
      format: formatFrom(edition.physicalFormat),
      publisher: edition.publisher,
      publishedYear: yearFrom(edition.publishDate),
      releaseDate: releaseDateFrom(edition.publishDate),
      coverUrl: edition.coverUrl,
      series: seriesFromOpenLibrary(edition.series),
    };
    return facts;
  },

  async title(title, author) {
    const match = await matchTitle({ title, author: author || "Unknown" });
    if (!match) return null;
    return {
      workKey: match.workKey,
      title: match.title ?? null,
      authors: match.authors ?? null,
      subjects: match.subjects ?? null,
      coverUrl: match.coverUrl,
      pages: match.pages,
      year: match.year ?? null,
    };
  },
};
