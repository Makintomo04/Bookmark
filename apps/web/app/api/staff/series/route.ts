import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { recentSeriesChanges, saveSeries, searchSeries, seriesBookById, seriesBooksByName, seriesDetail } from "@/lib/catalogueSeries";
import { isObjectId } from "@/lib/staffUsers";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

// /staff/catalogue/series. ?q= finds series names (none: the ones spelled more than one way); ?name= opens
// one in the editor; ?books= lists another spelling's books to merge in; ?work= is one book to add;
// ?recent=1 is the last ten saves and undos.
export async function GET(req: Request) {
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const params = new URL(req.url).searchParams;
  if (params.get("recent")) return NextResponse.json(await recentSeriesChanges());
  const name = params.get("name");
  if (name) return NextResponse.json(await seriesDetail(name));
  const books = params.get("books");
  if (books) return NextResponse.json(await seriesBooksByName(books));
  const work = params.get("work");
  if (work !== null) {
    const found = isObjectId(work) ? await seriesBookById(work) : null;
    return found ? NextResponse.json(found) : NextResponse.json({ error: "No book with that id." }, { status: 404 });
  }
  return NextResponse.json(await searchSeries(params.get("q") ?? ""));
}

// Body: { name, rename?, merge?, entries: [{ workId, position }], removed?, reason }, the whole edit.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const body = await jsonBody(req);
  return staffAnswer(await saveSeries(user, body));
}
