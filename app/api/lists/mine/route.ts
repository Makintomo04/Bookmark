import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { findMyLists } from "@/lib/lists";

// Backs "Add to list": every list the reader owns, with the books on it.
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json([]);
  }
  return NextResponse.json(await findMyLists(currentUser));
}
