import prisma from "@/lib/db";
import { Prisma, type Edition, type Work } from "@prisma/client";
import type { CatalogStore, EditionRecord, WorkRecord } from "./resolve";

// The CatalogStore over Prisma. Work and Edition rows are the records themselves (same field names);
// timestamps are left to the database.

const isDuplicate = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const workRecord = ({ createdAt: _c, updatedAt: _u, ...w }: Work): WorkRecord => w;
const editionRecord = ({ createdAt: _c, updatedAt: _u, ...e }: Edition): EditionRecord => e;

export const prismaCatalogStore: CatalogStore = {
  async findWorks(keys) {
    if (!keys.length) return [];
    return (await prisma.work.findMany({ where: { key: { in: keys } } })).map(workRecord);
  },
  async findWorksByMatch(matchKeys) {
    if (!matchKeys.length) return [];
    return (await prisma.work.findMany({ where: { matchKey: { in: matchKeys } } })).map(workRecord);
  },
  async getWorks(ids) {
    if (!ids.length) return [];
    return (await prisma.work.findMany({ where: { id: { in: ids } } })).map(workRecord);
  },
  async findEditions({ keys, isbn13, isbn10 }) {
    const or: Prisma.EditionWhereInput[] = [];
    if (keys.length) or.push({ key: { in: keys } });
    if (isbn13.length) or.push({ isbn13: { in: isbn13 } });
    if (isbn10.length) or.push({ isbn10: { in: isbn10 } });
    if (!or.length) return [];
    return (await prisma.edition.findMany({ where: { OR: or } })).map(editionRecord);
  },
  // One insert for the batch; if any key already exists, fall back to one row at a time so the clash
  // comes back as the existing row and the rest still go in.
  async createWorks(rows) {
    if (!rows.length) return [];
    try {
      await prisma.work.createMany({ data: rows });
      return rows;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
    }
    const out: WorkRecord[] = [];
    for (const row of rows) {
      try {
        out.push(workRecord(await prisma.work.create({ data: row })));
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        out.push(workRecord(await prisma.work.findUniqueOrThrow({ where: { key: row.key } })));
      }
    }
    return out;
  },
  async createEditions(rows) {
    if (!rows.length) return [];
    try {
      await prisma.edition.createMany({ data: rows });
      return rows;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
    }
    const out: EditionRecord[] = [];
    for (const row of rows) {
      try {
        out.push(editionRecord(await prisma.edition.create({ data: row })));
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        out.push(editionRecord(await prisma.edition.findUniqueOrThrow({ where: { key: row.key } })));
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
