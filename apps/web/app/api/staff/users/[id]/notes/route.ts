import { requirePermission } from "@/lib/apiAuth";
import { addNote, notesFor } from "@/lib/staffNotes";
import { jsonBody, staffAnswer } from "@/lib/staffRoute";

type Params = { params: Promise<{ id: string }> };

// The team's notes on an account, newest first. Any staff who can see readers can read and add them on a
// reader; on a librarian or admin, only admins can (lib/staffNoteRules.ts).
export async function GET(_req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("users.view");
  if (response) return response;
  return staffAnswer(await notesFor(user, params.id));
}

// Body: { body }. Answers with the notes, the new one first.
export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const { user, response } = await requirePermission("users.view");
  if (response) return response;
  return staffAnswer(await addNote(user, params.id, await jsonBody(req)));
}
