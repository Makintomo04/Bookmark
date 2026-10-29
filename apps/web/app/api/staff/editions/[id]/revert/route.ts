import { requirePermission } from "@/lib/apiAuth";
import { revertEdition } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Undo a logged edit to the edition. Body: { actionId, reason? }. 409 when a field has changed since.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { actionId, reason } = await jsonBody(req);
  return staffAnswer(await revertEdition(user, params.id, actionId, typeof reason === "string" ? reason : undefined));
}
