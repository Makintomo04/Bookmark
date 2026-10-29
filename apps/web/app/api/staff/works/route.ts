import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { addWorkFromOpenLibrary, createWorkByHand, searchWorks } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

// /staff/catalogue: find a book by title, author, ISBN, Open Library key or id.
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  return NextResponse.json(await searchWorks(new URL(req.url).searchParams.get("q") ?? ""));
}

// Body: { openLibraryKey }, to file a book nobody has shelved yet so it can be corrected. Or a book
// neither Open Library nor Hardcover has: { title, authors, description?, coverUrl?, seriesName?, seriesPosition? }.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const body = await jsonBody(req);
  if ("title" in body) return staffAnswer(await createWorkByHand(user, body));
  return staffAnswer(await addWorkFromOpenLibrary(user, typeof body.openLibraryKey === "string" ? body.openLibraryKey : ""));
}
