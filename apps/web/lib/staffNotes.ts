import prisma from "@/lib/db";
import { logStaffAction } from "@/lib/staffLog";
import { mayKeepNotesOn, STAFF_NOTES_ADMIN_ONLY } from "@/lib/staffNoteRules";
import { staffFail as fail, type StaffOutcome } from "@/lib/staffRoute";
import { cleanNote, STAFF_NOTE_MAX } from "@/lib/staffUserRules";
import { isObjectId } from "@/lib/staffUsers";

// Notes the team keeps on an account (/staff/users): on a reader, for anyone with users.view; on a
// librarian or admin, for admins only (lib/staffNoteRules.ts). Never shown to the account itself. Adding
// one is logged as user.note with the note's length, not its text: the note itself is the record, and
// the log is read more widely.

export interface StaffNoteView {
  id: string;
  body: string;
  createdAt: string;
  author: string | null;
}

type Actor = { id: string; role?: string | null; isStaff?: boolean | null };

// Null when this viewer may read and write the account's notes, otherwise the refusal.
async function refusal(viewer: Actor, userId: string) {
  const target = isObjectId(userId) ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isStaff: true } }) : null;
  if (!target) return fail(404, "No account with that id.");
  return mayKeepNotesOn(viewer, target) ? null : fail(403, STAFF_NOTES_ADMIN_ONLY);
}

async function listNotes(userId: string): Promise<StaffOutcome<StaffNoteView[]>> {
  const notes = await prisma.staffNote.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  const authors = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(notes.map((n) => n.authorId))) } }, select: { id: true, username: true } });
  const username = new Map(authors.map((a) => [a.id, a.username]));
  return {
    ok: true,
    value: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), author: username.get(n.authorId) ?? null })),
  };
}

// Newest first.
export async function notesFor(viewer: Actor, userId: string): Promise<StaffOutcome<StaffNoteView[]>> {
  return (await refusal(viewer, userId)) ?? listNotes(userId);
}

// Body: { body }. Answers with the notes, newest first, the new one included.
export async function addNote(actor: Actor, userId: string, input: { body?: unknown }): Promise<StaffOutcome<StaffNoteView[]>> {
  const body = cleanNote(input.body);
  if (!body) return fail(400, "Write the note first.");
  if (typeof input.body === "string" && input.body.trim().length > STAFF_NOTE_MAX) return fail(400, `Keep it under ${STAFF_NOTE_MAX} characters.`);
  const refused = await refusal(actor, userId);
  if (refused) return refused;
  await prisma.staffNote.create({ data: { userId, authorId: actor.id, body } });
  await logStaffAction({ actorId: actor.id, action: "user.note", targetType: "user", targetId: userId, after: { length: body.length } });
  return listNotes(userId);
}
