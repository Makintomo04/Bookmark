import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { LIST_ITEMS_MAX } from "@/lib/lists";
import { sameBook } from "@/lib/workKey";
import { BULK_MAX } from "@/lib/bulkRules";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const bodySchema = z.discriminatedUnion("action", [
  // Shelf moves that carry no read history, so they're safe to apply to many books at once. Moves that
  // open or close a read (start, finish, DNF) stay one book at a time through /api/book-progress.
  z.object({ action: z.literal("notInterested"), ids: z.array(objectId).min(1).max(BULK_MAX) }),
  z.object({ action: z.literal("wantToRead"), ids: z.array(objectId).min(1).max(BULK_MAX) }),
  z.object({ action: z.literal("addToList"), ids: z.array(objectId).min(1).max(BULK_MAX), listId: objectId }),
  z.object({ action: z.literal("remove"), ids: z.array(objectId).min(1).max(BULK_MAX) }),
]);

// Applies one action to many of the reader's own books. Ids that aren't theirs are ignored. Bulk moves
// don't post to the feed: nobody wants twenty "added a book" lines from a tidy-up.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const body = parsed.data;
  const ids = Array.from(new Set(body.ids));
  const mine = { userId: currentUser.id, id: { in: ids } };

  switch (body.action) {
    case "notInterested": {
      const { count } = await prisma.book.updateMany({ where: { ...mine, status: "NOT_STARTED" }, data: { status: "NOT_INTERESTED" } });
      return NextResponse.json({ updated: count, skipped: ids.length - count });
    }
    case "wantToRead": {
      const { count } = await prisma.book.updateMany({ where: { ...mine, status: "NOT_INTERESTED" }, data: { status: "NOT_STARTED" } });
      return NextResponse.json({ updated: count, skipped: ids.length - count });
    }
    case "addToList": {
      const list = await prisma.list.findFirst({
        where: { id: body.listId, ownerId: currentUser.id },
        include: { items: { select: { workKey: true, title: true, author: true, position: true } } },
      });
      if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
      const books = await prisma.book.findMany({ where: mine, select: { workKey: true, title: true, author: true, coverImage: true, pages: true } });
      const onList = [...list.items];
      const toAdd: typeof books = [];
      for (const book of books) {
        if (onList.some((item) => sameBook(item, book))) continue;
        onList.push({ ...book, position: 0 });
        toAdd.push(book);
      }
      const room = Math.max(0, LIST_ITEMS_MAX - list.items.length);
      const adding = toAdd.slice(0, room);
      let position = Math.max(-1, ...list.items.map((i) => i.position));
      if (adding.length > 0) {
        await prisma.listItem.createMany({
          data: adding.map((b) => ({
            listId: list.id,
            workKey: b.workKey,
            title: b.title.slice(0, 300),
            author: b.author.slice(0, 200) || "Unknown",
            coverUrl: b.coverImage.startsWith("https://") ? b.coverImage : null,
            pages: b.pages > 0 ? b.pages : null,
            position: ++position,
          })),
        });
      }
      return NextResponse.json({ added: adding.length, alreadyOnList: books.length - toAdd.length, overLimit: toAdd.length - adding.length });
    }
    case "remove": {
      // As the single delete does: favourites lose the removed books too.
      const books = await prisma.book.findMany({ where: mine, select: { id: true } });
      const removed = new Set(books.map((b) => b.id));
      await prisma.book.deleteMany({ where: { id: { in: Array.from(removed) } } });
      const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { favouriteIds: true } });
      if (user?.favouriteIds.some((id) => removed.has(id))) {
        await prisma.user.update({ where: { id: currentUser.id }, data: { favouriteIds: user.favouriteIds.filter((id) => !removed.has(id)) } });
      }
      return NextResponse.json({ removed: removed.size });
    }
  }
}
