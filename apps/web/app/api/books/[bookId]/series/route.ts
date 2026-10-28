import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { seriesForBook } from "@/lib/seriesFollows";

// The series of one of the reader's books, and whether they follow it (the app's book screen).
export async function GET(_req: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const { user, response } = await requireUser();
  if (response) return response;
  if (!/^[0-9a-f]{24}$/i.test(params.bookId)) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  return NextResponse.json({ series: await seriesForBook(user.id, params.bookId) });
}
