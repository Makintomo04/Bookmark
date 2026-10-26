import { requirePermission } from "@/lib/apiAuth";
import { fixEdition } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: { id: string } };

// Body: any of { pages, coverUrl }, plus an optional { reason } for the log.
export async function PATCH(req: Request, { params }: Params) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { reason, ...body } = await jsonBody(req);
  return staffAnswer(await fixEdition(user, params.id, body, typeof reason === "string" ? reason : undefined));
}
