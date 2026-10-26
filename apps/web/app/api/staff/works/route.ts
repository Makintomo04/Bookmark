import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { searchWorks } from "@/lib/catalogueFix";

// /staff/catalogue: find a book by title, ISBN, Open Library key or id.
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  return NextResponse.json(await searchWorks(new URL(req.url).searchParams.get("q") ?? ""));
}
