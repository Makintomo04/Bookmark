import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { addWorkFromOpenLibrary, searchWorks } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

// /staff/catalogue: find a book by title, ISBN, Open Library key or id.
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  return NextResponse.json(await searchWorks(new URL(req.url).searchParams.get("q") ?? ""));
}

// Body: { openLibraryKey }. Files a book nobody has shelved yet, so it can be corrected.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { openLibraryKey } = await jsonBody(req);
  return staffAnswer(await addWorkFromOpenLibrary(user, typeof openLibraryKey === "string" ? openLibraryKey : ""));
}
