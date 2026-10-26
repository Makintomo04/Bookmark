import { roleOf } from "./roles";

// The staff badge beside a name on profiles and reviews, so readers can tell real staff from someone
// pretending. Admins read as "Bookmark team", never "Admin": the badge says the account is official
// without listing what it can do. Librarians can hide theirs; the team can't, or the badge stops
// meaning anything.

// The User fields these need. Spread into a Prisma `select`.
export const staffBadgeSelect = { role: true, isStaff: true, hideStaffBadge: true } as const;

export type StaffBadgeKind = "team" | "librarian";

export const STAFF_BADGE: Record<StaffBadgeKind, { label: string; title: string }> = {
  team: { label: "Bookmark team", title: "Works on Bookmark" },
  librarian: { label: "Librarian", title: "Helps keep Bookmark's book details right" },
};

type Stored = { role?: string | null; isStaff?: boolean | null; hideStaffBadge?: boolean | null };

export function staffBadgeOf(user: Stored | null | undefined): StaffBadgeKind | null {
  const role = roleOf(user);
  if (role === "ADMIN") return "team";
  if (role === "LIBRARIAN" && !user?.hideStaffBadge) return "librarian";
  return null;
}
