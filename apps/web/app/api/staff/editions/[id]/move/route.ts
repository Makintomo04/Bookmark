import { requirePermission } from "@/lib/apiAuth";
import { moveEdition } from "@/lib/catalogueMerge";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Move an edition filed under the wrong book, with readers' copies of it. Body: { toWorkId, reason }, the reason required.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { toWorkId, reason } = await jsonBody(req);
  return staffAnswer(await moveEdition(user, params.id, toWorkId, reason));
}
