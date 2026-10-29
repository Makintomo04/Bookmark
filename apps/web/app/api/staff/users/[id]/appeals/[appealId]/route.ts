import { requirePermission } from "@/lib/apiAuth";
import { decideAppeal } from "@/lib/staffAppeals";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string; appealId: string }> };

// Decides an appeal. Body: { decision: "UPHELD" | "REJECTED", note }. Upholding lifts the suspension.
export async function PUT(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("users.suspend");
  if (response) return response;
  return staffAnswer(await decideAppeal(user, params.id, params.appealId, await jsonBody(req)));
}
