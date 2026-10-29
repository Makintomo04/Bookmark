import { requirePermission } from "@/lib/apiAuth";
import { setWorkPage } from "@/lib/catalogueFix";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// A hand-typed book's page (lib/workPages.ts). PUT gives it one, DELETE takes it down. Body: optional { reason } for the log.
async function setPage(req: Request, props: Params, approve: boolean) {
  const params = await props.params;
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  const { reason } = await jsonBody(req);
  return staffAnswer(await setWorkPage(user, params.id, approve, typeof reason === "string" ? reason : undefined));
}

export const PUT = (req: Request, props: Params) => setPage(req, props, true);
export const DELETE = (req: Request, props: Params) => setPage(req, props, false);
