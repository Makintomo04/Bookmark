import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiAuth";
import { findStaffWork, fixWork } from "@/lib/catalogueFix";
import { isObjectId } from "@/lib/staffUsers";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, props: Params) {
  const params = await props.params;
  const { response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const work = isObjectId(params.id) ? await findStaffWork(params.id) : null;
  return work ? NextResponse.json(work) : NextResponse.json({ error: "No book with that id." }, { status: 404 });
}

// Body: any of { title, authors, description, coverUrl, seriesName, seriesPosition, firstPublishYear, releaseDate }, plus an
// optional { reason } for the log. Saving a change closes the open reports about the book.
export async function PATCH(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { reason, ...body } = await jsonBody(req);
  return staffAnswer(await fixWork(user, params.id, body, typeof reason === "string" ? reason : undefined));
}
