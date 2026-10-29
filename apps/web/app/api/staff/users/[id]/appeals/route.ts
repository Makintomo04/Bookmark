import { requirePermission } from "@/lib/apiAuth";
import { openAppeal } from "@/lib/staffAppeals";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// Logs a suspended reader's appeal. Body: { summary }. Answers with their card.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("users.suspend");
  if (response) return response;
  return staffAnswer(await openAppeal(user, params.id, await jsonBody(req)));
}
