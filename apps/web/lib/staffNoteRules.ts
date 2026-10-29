import { can, isStaffRole } from "@/lib/roles";

// Who reads and writes the team's notes on an account (lib/staffNotes.ts). Notes on a reader are for
// anyone who can see readers (users.view). Notes on a librarian or admin are for admins alone (anyone who
// can suspend): librarians don't keep notes on each other or on the admins above them.
type Viewer = { role?: string | null; isStaff?: boolean | null };
type Target = { role?: string | null; isStaff?: boolean | null };

export function mayKeepNotesOn(viewer: Viewer | null | undefined, target: Target): boolean {
  if (!can(viewer, "users.view")) return false;
  return !isStaffRole(target) || can(viewer, "users.suspend");
}

export const STAFF_NOTES_ADMIN_ONLY = "Notes on staff accounts are for admins.";
