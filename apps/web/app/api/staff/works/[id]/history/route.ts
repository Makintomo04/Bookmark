import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { openReportCount } from "@/lib/catalogueFix";
import { mergeHistory } from "@/lib/catalogueMerge";
import { bookHistory } from "@/lib/staffLog";
import { isObjectId } from "@/lib/staffUsers";

type Params = { params: Promise<{ id: string }> };

// For the work editor: recent edits to the book and its editions, merges and edition moves it was part of,
// and how many readers' reports about it saving would close.
export async function GET(_req: Request, props: Params) {
  const params = await props.params;
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  if (!isObjectId(params.id)) return NextResponse.json({ error: "No book with that id." }, { status: 404 });
  const [history, merges, openReports] = await Promise.all([bookHistory(params.id), mergeHistory(params.id), openReportCount(params.id)]);
  return NextResponse.json({ history, merges, openReports });
}
