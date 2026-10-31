// The Prisma enums the shared rules use, as plain unions so this package never needs @prisma/client.
// apps/web/lib/sharedEnums.check.ts fails the type-check if prisma/schema.prisma drifts from these.

export type Plan = "FREE" | "PLUS";
export type ProfileVisibility = "PUBLIC" | "FOLLOWERS" | "PRIVATE";
export type ReviewVisibility = "EVERYONE" | "FOLLOWERS" | "ONLY_ME";
export type ReviewCommentAudience = "EVERYONE" | "FRIENDS" | "OFF";
export type BuddyReadInviteAudience = "EVERYONE" | "FOLLOWING" | "FRIENDS" | "NOBODY";
export type ListVisibility = "PRIVATE" | "PUBLIC";
export type Status = "NOT_STARTED" | "STARTED" | "COMPLETED" | "DNF" | "PAUSED" | "NOT_INTERESTED";
export type EditionFormat = "PAPERBACK" | "HARDCOVER" | "EBOOK" | "AUDIOBOOK";
