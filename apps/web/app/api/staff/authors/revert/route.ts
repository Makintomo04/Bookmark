import { requirePermission } from "@/lib/apiAuth";
import { undoAuthorChange } from "@/lib/catalogueAuthors";
import { undoAnswer } from "@/lib/catalogueUndo";
import { jsonBody } from "@/lib/staffRoute";

// Undo a rename or merge from /staff/catalogue/authors. Body: { actionId, reason }. A 409 with `conflicts`
// lists the books changed since, and nothing was undone.
export async function POST(req: Request) {
  const { user, response } = await requirePermission("catalogue.edit");
  if (response) return response;
  return undoAnswer(await undoAuthorChange(user, await jsonBody(req)));
}
