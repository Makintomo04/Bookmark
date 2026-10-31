import { requirePermission } from "@/lib/apiAuth";
import { undoSeriesSave } from "@/lib/catalogueSeries";
import { undoAnswer } from "@/lib/catalogueUndo";
import { jsonBody } from "@/lib/staffRoute";

// Undo a save from /staff/catalogue/series. Body: { actionId, reason }. A 409 with `conflicts` lists the
// books changed since, and nothing was undone.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  return undoAnswer(await undoSeriesSave(user, await jsonBody(req)));
}
