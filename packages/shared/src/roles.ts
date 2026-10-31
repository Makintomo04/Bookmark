// Staff roles and what each may do. Pure, so the server guards (lib/apiAuth.ts requirePermission), the
// staff console and tests all read the same table. Every staff action is checked on the server; the
// client only uses can() to decide which controls to show.
//
//   READER     everyone
//   LIBRARIAN  fixes the catalogue, curates lists and works the reports queue
//   ADMIN      all of that, plus suspensions, Plus grants and roles

export const ROLES = ["READER", "LIBRARIAN", "ADMIN"] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  // Correct a book's shared cover and details (lib/catalogueFix.ts).
  "catalogue.edit",
  // Bookmark Picks, featuring and hiding lists, editing anyone's list, no own-lists limit (lib/lists.ts).
  "lists.curate",
  // Read and resolve reports (lib/staffReports.ts).
  "reports.review",
  "users.view",
  "users.suspend",
  "plus.grant",
  "roles.assign",
  "staff.log",
  // A librarian's view of the log: their own actions, and the edit history of any book (lib/staffLog.ts).
  "log.own",
  // Creating quests and other seasonal content, when it comes back.
  "content.quests",
] as const
export type Permission = (typeof PERMISSIONS)[number]

const LIBRARIAN: readonly Permission[] = ["catalogue.edit", "lists.curate", "reports.review", "users.view", "log.own", "content.quests"]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  READER: [],
  LIBRARIAN,
  ADMIN: PERMISSIONS,
}

export const ROLE_LABELS: Record<Role, string> = {
  READER: "Reader",
  LIBRARIAN: "Librarian",
  ADMIN: "Admin",
}

type StoredRole = { role?: string | null; isStaff?: boolean | null }

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
}

// Unset reads as READER, except an account flagged with the old isStaff before roles existed: that was
// the team, so it reads as ADMIN until someone sets a role on it.
export function roleOf(user: StoredRole | null | undefined): Role {
  if (!user) return "READER"
  if (isRole(user.role)) return user.role
  return user.isStaff ? "ADMIN" : "READER"
}

export function can(user: StoredRole | null | undefined, permission: Permission): boolean {
  return ROLE_PERMISSIONS[roleOf(user)].includes(permission)
}

// Any staff role at all: shows the Staff link in the menu.
export function isStaffRole(user: StoredRole | null | undefined): boolean {
  return roleOf(user) !== "READER"
}

// ---- Suspensions ----------------------------------------------------------------------------

type StoredSuspension = { suspendedAt?: Date | string | null; suspendedUntil?: Date | string | null }

// Suspended from suspendedAt until suspendedUntil, or for good when suspendedUntil is unset.
export function isSuspended(user: StoredSuspension | null | undefined, now = new Date()): boolean {
  if (!user?.suspendedAt) return false
  if (!user.suspendedUntil) return true
  return new Date(user.suspendedUntil).getTime() > now.getTime()
}

export const SUSPENSION_DURATIONS = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  indefinite: null,
} as const satisfies Record<string, number | null>
export type SuspensionDuration = keyof typeof SUSPENSION_DURATIONS

export function suspensionEnd(duration: SuspensionDuration, now = new Date()): Date | null {
  const days = SUSPENSION_DURATIONS[duration]
  return days === null ? null : new Date(now.getTime() + days * 86_400_000)
}

// The rules for who may act on whom. An admin can't suspend or demote themselves or another admin
// through the console (another admin's role is changed in the database, on purpose), and the last
// admin always stays.
export function canActOn(actor: StoredRole & { id: string }, target: StoredRole & { id: string }): boolean {
  if (actor.id === target.id) return false
  return roleOf(target) !== "ADMIN"
}
