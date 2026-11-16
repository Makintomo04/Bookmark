import prisma from "../db";

// A page count for a copy whose own edition doesn't know one: the length most of its work's other print
// editions agree on (the shortest of a tie, usually the paperback), or null when none of them knows. Starting a
// book from Up next files it under a generic edition with no length, though another edition of the same work
// has one, and a book started with no length can only be logged in percent until someone types it in.
export async function workPageCount(workId: string | null | undefined): Promise<number | null> {
  if (!workId) return null;
  const editions = await prisma.edition.findMany({ where: { workId, pages: { gt: 0 } }, select: { pages: true, format: true } });
  const counts = new Map<number, number>();
  for (const { pages, format } of editions) {
    if (!pages || format === "AUDIOBOOK") continue;
    counts.set(pages, (counts.get(pages) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [pages, n] of counts) {
    const bestN = best === null ? 0 : counts.get(best)!;
    if (n > bestN || (n === bestN && best !== null && pages < best)) best = pages;
  }
  return best;
}

// The same, starting from the edition a shelf copy is linked to: its own length when it has one.
export async function editionPageCount(editionId: string | null | undefined): Promise<number | null> {
  if (!editionId) return null;
  const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { pages: true, workId: true } });
  if (!edition) return null;
  return edition.pages && edition.pages > 0 ? edition.pages : workPageCount(edition.workId);
}
