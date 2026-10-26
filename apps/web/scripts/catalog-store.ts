import type { Prisma, PrismaClient } from "@prisma/client";
import type { CatalogStore, EditionRecord, WorkRecord } from "../lib/catalog/resolve.ts";

// The same store as lib/catalog/prismaStore.ts, on a script's own client (that module imports
// "@/lib/db", which plain Node can't resolve). Used by backfill-catalog.ts and import-catalog.ts.

const isDuplicate = (err: unknown) => !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
const strip = <T extends { createdAt: Date; updatedAt: Date }>({ createdAt: _c, updatedAt: _u, ...rest }: T) => rest;

export function scriptCatalogStore(prisma: PrismaClient): CatalogStore {
  return {
    async findWorks(keys) {
      return keys.length ? (await prisma.work.findMany({ where: { key: { in: keys } } })).map(strip) : [];
    },
    async findWorksByMatch(matchKeys) {
      return matchKeys.length ? (await prisma.work.findMany({ where: { matchKey: { in: matchKeys } } })).map(strip) : [];
    },
    async getWorks(ids) {
      return ids.length ? (await prisma.work.findMany({ where: { id: { in: ids } } })).map(strip) : [];
    },
    async findEditions({ keys, isbn13, isbn10 }) {
      const or: Prisma.EditionWhereInput[] = [];
      if (keys.length) or.push({ key: { in: keys } });
      if (isbn13.length) or.push({ isbn13: { in: isbn13 } });
      if (isbn10.length) or.push({ isbn10: { in: isbn10 } });
      return or.length ? (await prisma.edition.findMany({ where: { OR: or } })).map(strip) : [];
    },
    async createWorks(rows) {
      const out: WorkRecord[] = [];
      for (const row of rows) {
        try {
          out.push(strip(await prisma.work.create({ data: row })));
        } catch (err) {
          if (!isDuplicate(err)) throw err;
          out.push(strip(await prisma.work.findUniqueOrThrow({ where: { key: row.key } })));
        }
      }
      return out;
    },
    async createEditions(rows) {
      const out: EditionRecord[] = [];
      for (const row of rows) {
        try {
          out.push(strip(await prisma.edition.create({ data: row })));
        } catch (err) {
          if (!isDuplicate(err)) throw err;
          out.push(strip(await prisma.edition.findUniqueOrThrow({ where: { key: row.key } })));
        }
      }
      return out;
    },
    async updateWork(id, patch) {
      await prisma.work.update({ where: { id }, data: patch });
    },
    async updateEdition(id, patch) {
      await prisma.edition.update({ where: { id }, data: patch });
    },
  };
}
