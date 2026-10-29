import type { CatalogStore, EditionRecord, WorkRecord } from "./resolve.ts";
import { MERGED_PREFIX } from "../catalogueMergeRules.ts";

// An in-memory CatalogStore with the same unique-key behaviour as the database, for tests.
export class MemoryCatalogStore implements CatalogStore {
  works = new Map<string, WorkRecord>();
  editions = new Map<string, EditionRecord>();

  async findWorks(keys: string[]) {
    return keys.flatMap((k) => (this.works.has(k) ? [{ ...this.works.get(k)! }] : []));
  }
  async findWorksByMatch(matchKeys: string[]) {
    const wanted = new Set(matchKeys);
    return Array.from(this.works.values()).filter((w) => w.matchKey && wanted.has(w.matchKey)).map((w) => ({ ...w }));
  }
  async getWorks(ids: string[]) {
    const wanted = new Set(ids);
    return Array.from(this.works.values()).filter((w) => wanted.has(w.id)).map((w) => ({ ...w }));
  }
  async findMergedWorks(openLibraryKeys: string[]) {
    const wanted = new Set(openLibraryKeys);
    return Array.from(this.works.values()).filter((w) => w.key.startsWith(MERGED_PREFIX) && w.openLibraryKey && wanted.has(w.openLibraryKey)).map((w) => ({ ...w }));
  }
  async findEditions(by: { keys: string[]; isbn13: string[]; isbn10: string[] }) {
    const keys = new Set(by.keys);
    const i13 = new Set(by.isbn13);
    const i10 = new Set(by.isbn10);
    return Array.from(this.editions.values())
      .filter((e) => keys.has(e.key) || (e.isbn13 && i13.has(e.isbn13)) || (e.isbn10 && i10.has(e.isbn10)))
      .map((e) => ({ ...e }));
  }
  async createWorks(rows: WorkRecord[]) {
    return rows.map((row) => {
      const existing = this.works.get(row.key);
      if (existing) return { ...existing };
      this.works.set(row.key, { ...row });
      return { ...row };
    });
  }
  async createEditions(rows: EditionRecord[]) {
    return rows.map((row) => {
      const existing = this.editions.get(row.key);
      if (existing) return { ...existing };
      this.editions.set(row.key, { ...row });
      return { ...row };
    });
  }
  async updateWork(id: string, patch: Partial<WorkRecord>) {
    this.works.forEach((w) => { if (w.id === id) Object.assign(w, patch); });
  }
  async updateEdition(id: string, patch: Partial<EditionRecord>) {
    this.editions.forEach((e) => { if (e.id === id) Object.assign(e, patch); });
  }
}
