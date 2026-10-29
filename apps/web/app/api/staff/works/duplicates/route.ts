import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { duplicatesPage } from "@/lib/catalogueMerge";

// /staff/catalogue/duplicates: likely duplicate books in pairs, a page at a time (?page=0).
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const page = Number(new URL(req.url).searchParams.get("page") ?? 0);
  return NextResponse.json(await duplicatesPage(Number.isFinite(page) ? page : 0));
}
