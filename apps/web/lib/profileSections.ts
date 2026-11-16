// The sections of your own profile you can fold up, by the id on each one's heading (ShelfSection).
// Saved on the account (User.collapsedSections, through /api/user/privacy), so a choice sticks across
// devices. The shelves match BookGrid's ids (`shelf-<ShelfKey>`); the rest are the profile's own sections.
export const PROFILE_SECTIONS = [
  "shelf-reading",
  "shelf-paused",
  "shelf-want",
  "shelf-finished",
  "shelf-dnf",
  "shelf-notInterested",
  "series-tracker",
  "profile-reviews",
  "profile-authors",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const isProfileSection = (id: string): id is ProfileSection => (PROFILE_SECTIONS as readonly string[]).includes(id);
