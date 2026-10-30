import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { addWorkFromHardcover, addWorkFromOpenLibrary, createWorkByHand, searchOutsideCatalogue, searchWorks } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

// /staff/catalogue: find a book by title, author, ISBN, Open Library key or id.
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const params = new URL(req.url).searchParams;
  const q = params.get("q") ?? "";
  // ?outside=1: Open Library's and Hardcover's matches, for filing a book the catalogue lacks.
  if (params.get("outside")) {
    try {
      return NextResponse.json(await searchOutsideCatalogue(q));
    } catch {
      return NextResponse.json({ error: "Couldn't reach Open Library. Try again in a moment." }, { status: 502 });
    }
  }
  return NextResponse.json(await searchWorks(q));
}

// Body: { openLibraryKey }, or a Hardcover hit { hardcoverId, title, author, coverUrl? }, to file a book nobody has shelved yet so it can be corrected. Or a book
// neither Open Library nor Hardcover has: { title, authors, description?, coverUrl?, seriesName?, seriesPosition? }.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const body = await jsonBody(req);
  if ("hardcoverId" in body) return staffAnswer(await addWorkFromHardcover(user, body));
  if ("title" in body) return staffAnswer(await createWorkByHand(user, body));
  return staffAnswer(await addWorkFromOpenLibrary(user, typeof body.openLibraryKey === "string" ? body.openLibraryKey : ""));
}
