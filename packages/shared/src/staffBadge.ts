import { roleOf } from "./roles";

// The staff badge beside a name on profiles and reviews, so readers can tell real staff from someone
// pretending. Admins read as "Bookmark team", never "Admin": the badge says the account is official
// without listing what it can do. Librarians can hide theirs; the team can't, or the badge stops
// meaning anything.

// The User fields these need. Spread into a Prisma `select`.
export const staffBadgeSelect = { role: true, isStaff: true, hideStaffBadge: true } as const;

export type StaffBadgeKind = "team" | "librarian";

// who: what pressing the seal says, naming the person when known. about: what the role does.
// colour: the seal's fill, and ink the glyph's: dark on the librarian's yellow, which white can't be read on.
// glyph: a filled path in a 24 box. The two outlines differ (a tall ribbon, a wide open book) so the roles
// read apart without telling the colours apart.
export const STAFF_BADGE: Record<StaffBadgeKind, { label: string; title: string; who: (name?: string | null) => string; about: string; colour: string; ink: string; glyph: string }> = {
  team: {
    label: "Bookmark team",
    title: "Works on Bookmark",
    who: (name) => name ? `${name} is on the Bookmark team` : "On the Bookmark team",
    about: "They work on Bookmark. Anything they say here comes from us.",
    colour: "#F13C3C",
    ink: "#FFFFFF",
    glyph: "M8 5.5h8v13l-4-2.8-4 2.8z",
  },
  librarian: {
    label: "Librarian",
    title: "Helps keep Bookmark's book details right",
    who: (name) => name ? `${name} is a librarian` : "A Bookmark librarian",
    about: "Librarians are readers who help keep Bookmark's book details right: covers, editions and series.",
    colour: "#F2C230",
    ink: "#3D2C02",
    // Pages that rise to their outer corners, either side of a narrow spine: two flat bars read as "pause".
    glyph: "M11.3 8.7C9.5 7.3 7.3 6.6 5 6.6v10.7c2.3 0 4.5.6 6.3 1.9zM12.7 8.7c1.8-1.4 4-2.1 6.3-2.1v10.7c-2.3 0-4.5.6-6.3 1.9z",
  },
};

type Stored = { role?: string | null; isStaff?: boolean | null; hideStaffBadge?: boolean | null };

export function staffBadgeOf(user: Stored | null | undefined): StaffBadgeKind | null {
  const role = roleOf(user);
  if (role === "ADMIN") return "team";
  if (role === "LIBRARIAN" && !user?.hideStaffBadge) return "librarian";
  return null;
}
