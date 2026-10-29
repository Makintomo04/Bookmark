import { requirePermission } from "@/lib/apiAuth";
import { unmoveEdition } from "@/lib/catalogueMerge";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Undo a logged edition move. Body: { actionId, reason, workId? }, the reason required; workId is the book
// being looked at, handed back. 409, with what's in the way, when the edition or its copies have moved since.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { actionId, reason, workId } = await jsonBody(req);
  return staffAnswer(await unmoveEdition(user, params.id, actionId, reason, workId));
}
