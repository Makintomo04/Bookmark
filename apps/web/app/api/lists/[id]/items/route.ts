import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { LIST_ITEMS_MAX } from "@/lib/lists";
import { normaliseWorkKey, sameBook } from "@/lib/workKey";

type Params = { params: Promise<{ id: string }> };

// Appends one book to the end of a list the reader owns, so "Add to list" doesn't need the whole list.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser("Sign in to add to a list.");
  if (response) return response;
  if (!/^[0-9a-f]{24}$/i.test(params.id)) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  const list = await prisma.list.findFirst({
    where: { id: params.id, ownerId: currentUser.id },
    include: { items: { select: { workKey: true, title: true, author: true, position: true } } },
  });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const body = await req.json();
  const book = {
    workKey: normaliseWorkKey(body?.workKey),
    title: typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "",
    author: typeof body?.author === "string" && body.author.trim() ? body.author.trim().slice(0, 200) : "Unknown",
  };
  if (!book.title) {
    return NextResponse.json({ error: "That book is missing a title." }, { status: 400 });
  }
  if (list.items.some((item) => sameBook(item, book))) {
    return NextResponse.json({ error: "That book is already on this list." }, { status: 409 });
  }
  if (list.items.length >= LIST_ITEMS_MAX) {
    return NextResponse.json({ error: `Lists can hold up to ${LIST_ITEMS_MAX} books.` }, { status: 400 });
  }

  await prisma.list.update({
    where: { id: list.id },
    data: {
      items: {
        create: {
          ...book,
          coverUrl: typeof body?.coverUrl === "string" && body.coverUrl.startsWith("https://") ? body.coverUrl : null,
          pages: Number.isInteger(body?.pages) && body.pages > 0 ? body.pages : null,
          position: Math.max(-1, ...list.items.map((i) => i.position)) + 1,
        },
      },
    },
  });
  return NextResponse.json({ added: true });
}
