import { requirePermission } from "@/lib/apiAuth";
import { unmergeWorks } from "@/lib/catalogueMerge";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Undo a logged merge, from either book in it. Body: { actionId, reason }, the reason required. 409, with what's in the way,
// when rows have changed since in a way that makes it unsafe.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { actionId, reason } = await jsonBody(req);
  return staffAnswer(await unmergeWorks(user, params.id, actionId, reason));
}
