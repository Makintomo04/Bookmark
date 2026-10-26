import { requirePermission } from "@/lib/apiAuth";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";
import { suspendUser, unsuspendUser } from "@/lib/staffUsers";

type Params = { params: { id: string } };

// Body: { duration: "1d" | "7d" | "30d" | "indefinite", reason }.
export async function POST(req: Request, { params }: Params) {
  const { user, response } = await requirePermission("users.suspend");
  if (response) return response;
  return staffAnswer(await suspendUser(user, params.id, await jsonBody(req)));
}

// Lifts it. Body (optional): { reason }.
export async function DELETE(req: Request, { params }: Params) {
  const { user, response } = await requirePermission("users.suspend");
  if (response) return response;
  return staffAnswer(await unsuspendUser(user, params.id, await jsonBody(req)));
}
