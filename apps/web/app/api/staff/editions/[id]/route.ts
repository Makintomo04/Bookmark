import { requirePermission } from "@/lib/apiAuth";
import { fixEdition } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Body: any of { pages, coverUrl, isbn13, isbn10, publisher, publishedYear, format }, plus an optional { reason } for the log.
export async function PATCH(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { reason, ...body } = await jsonBody(req);
  return staffAnswer(await fixEdition(user, params.id, body, typeof reason === "string" ? reason : undefined));
}
