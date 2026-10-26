import { requirePermission } from "@/lib/apiAuth";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";
import { setRole } from "@/lib/staffUsers";

type Params = { params: { id: string } };

// Body: { role: "READER" | "LIBRARIAN" | "ADMIN" }. Not on yourself or another admin (roles.ts canActOn).
export async function PUT(req: Request, { params }: Params) {
  const { user, response } = await requirePermission("roles.assign");
  if (response) return response;
  return staffAnswer(await setRole(user, params.id, await jsonBody(req)));
}
