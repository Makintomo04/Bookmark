import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { genrePicks } from "@/lib/genrePicks";

// Popular books in the reader's favourite genres, for Discover and a new reader's shelf (web and mobile).
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json(await genrePicks(user.id, user.favGenres ?? []));
}
