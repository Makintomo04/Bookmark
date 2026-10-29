import { requirePermission } from "@/lib/apiAuth";
import { mergeWorks } from "@/lib/catalogueMerge";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Merge this book (a duplicate) into another. Body: { intoId, reason }, the reason required. Everything on it moves to intoId;
// the book's history there can undo it.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { intoId, reason } = await jsonBody(req);
  return staffAnswer(await mergeWorks(user, params.id, intoId, reason));
}
