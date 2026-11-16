import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { shelfMatches } from "@/lib/shelfCopy";

// Which of these books the reader already has, and on which shelf: a row of Discover, a genre, an author's
// books, or the one book Add a book is about to add. The phone says "On your shelf" (and doesn't offer Add)
// before anyone taps, rather than after the add is turned away.
const ON_SHELF_MAX = 200;

const bodySchema = z.object({
  books: z.array(z.object({ title: z.string().max(500), author: z.string().max(500), workKey: z.string().max(100).nullish() })).max(ON_SHELF_MAX),
});

export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  // In the order asked: the reader's copy (its id and shelf), or null.
  return NextResponse.json({ books: await shelfMatches(currentUser.id, parsed.data.books) });
}
