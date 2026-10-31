import { requirePermission } from "@/lib/apiAuth";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";
import { grantPlus, revokePlus } from "@/lib/staffUsers";

type Params = { params: Promise<{ id: string }> };

// Free Plus through compPlusUntil, with no Stripe or store subscription. Body: { grant: "1m" | "3m" | "6m" | "1y" | "indefinite", note }.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("plus.grant");
  if (response) return response;
  return staffAnswer(await grantPlus(user, params.id, await jsonBody(req)));
}

// Ends free Plus now. Paid plans aren't touched.
export async function DELETE(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("plus.grant");
  if (response) return response;
  return staffAnswer(await revokePlus(user, params.id, await jsonBody(req)));
}
