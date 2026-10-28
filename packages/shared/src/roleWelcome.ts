import { roleOf, type Role } from "./roles";

// The welcome a librarian or admin sees the first time the app loads after they get the role: what it
// is and what it lets them do. Shown once per role (User.roleWelcomedAs); readers never see one.

export type StaffRole = Exclude<Role, "READER">;

export type RoleWelcome = {
  // The modal's heading, like a medal's.
  heading: string;
  title: string;
  lede: string;
  duties: string[];
  badge: string;
};

export const ROLE_WELCOME: Record<StaffRole, RoleWelcome> = {
  LIBRARIAN: {
    heading: "New role",
    title: "You're a Librarian",
    lede: "You help keep Bookmark's books right for every reader.",
    duties: [
      "Fix covers and details on any book, from the staff catalogue or the book's own page.",
      "Curate lists: choose Bookmark Picks, feature or hide lists, and edit anyone's list.",
      "Work the reports queue, and pass anything that needs a suspension to an admin.",
      "Look up readers' accounts when a report needs it.",
    ],
    badge: "A Librarian badge now shows on your profile picture and beside your name in reviews, comments, lists and notifications. You can hide it in Settings, under Privacy.",
  },
  ADMIN: {
    heading: "New role",
    title: "You're on the Bookmark team",
    lede: "Everything a librarian does, plus looking after accounts.",
    duties: [
      "Fix the catalogue, curate lists and resolve reports, including ones a librarian escalated.",
      "Suspend accounts for a day, a week, a month or for good.",
      "Grant Plus, and make readers librarians or admins.",
      "Every staff action is kept in the staff log, so check it when something looks off.",
    ],
    badge: "A Bookmark team badge now shows on your profile picture and beside your name in reviews, comments, lists and notifications. It always shows, so readers can trust it.",
  },
};

type Stored = { role?: string | null; isStaff?: boolean | null; roleWelcomedAs?: string | null };

// The role to welcome the account to, or null when there's nothing new.
export function roleToWelcome(user: Stored | null | undefined): StaffRole | null {
  const role = roleOf(user);
  if (role === "READER") return null;
  return user?.roleWelcomedAs === role ? null : role;
}
