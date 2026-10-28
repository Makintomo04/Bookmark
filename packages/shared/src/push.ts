// Push notifications for the mobile app: which notifications are sent as pushes, grouped the way the
// app's settings let a reader switch them off (User.pushOff), and the words they carry.
//
// What's pushed is the social side, the things that bring someone back to a reading circle or a friend,
// and a new book in a series they read.
// Achievements stay in the bell. No push ever carries what someone wrote (comments,
// reviews, a recommendation's note): a lock screen is read over shoulders, and a comment's words are only
// shown once the reader's progress has reached it.

import { seriesNewsText } from "./series";

export const PUSH_GROUPS = {
  circles: ["BUDDY_READ_INVITE", "BUDDY_READ_JOINED", "COMMENTS_UNLOCKED", "BUDDY_READ_HOSTED"],
  follows: ["NEW_FOLLOWER", "FOLLOW_REQUEST"],
  recommendations: ["BOOK_RECOMMENDED"],
  account: ["REVIEW_HIDDEN"],
  series: ["NEW_IN_SERIES"],
} as const;

export type PushGroup = keyof typeof PUSH_GROUPS;
export type PushType = (typeof PUSH_GROUPS)[PushGroup][number];

export const PUSH_GROUP_LABELS: Record<PushGroup, { title: string; description: string }> = {
  circles: { title: "Reading circles", description: "Invites, people joining, new comments you can read, and hosting handed to you." },
  follows: { title: "Followers", description: "New followers and follow requests." },
  recommendations: { title: "Books from friends", description: "When a friend sends you a book." },
  account: { title: "Your account", description: "When the Bookmark team hides something you posted." },
  series: { title: "New books in your series", description: "When a new book comes out in a series you follow or have started." },
};

// Pushed even though the reader is the notification's actor: nobody did it, so actorId is the reader
// (lib/seriesNews.ts). Every other notification you're the actor of is something you did, and isn't pushed.
export const pushedToSelf = (type: string) => type === "NEW_IN_SERIES";

export const isPushGroup = (value: unknown): value is PushGroup => typeof value === "string" && value in PUSH_GROUPS;

export function pushGroupOf(type: string): PushGroup | null {
  for (const [group, types] of Object.entries(PUSH_GROUPS) as [PushGroup, readonly string[]][]) {
    if (types.includes(type)) return group;
  }
  return null;
}

export interface PushContext {
  type: string;
  actorUsername: string | null;
  // The recommended book, or the reading circle's book.
  bookTitle: string | null;
  buddyReadId: string | null;
  count: number | null;
  // NEW_IN_SERIES: the new book's series and place (bookTitle is the book).
  seriesName?: string | null;
  seriesPosition?: number | null;
}

export interface PushContent {
  title: string;
  body: string;
  // The app screen to open, as a path the app's router understands.
  path: string;
}

const someone = (username: string | null) => (username ? `@${username}` : "Someone");
const book = (title: string | null) => (title ? title : "your book");

// The push for one notification, or null when that type isn't pushed.
export function pushContentFor(n: PushContext): PushContent | null {
  const who = someone(n.actorUsername);
  const circlePath = n.buddyReadId ? `/circles/${n.buddyReadId}` : "/circles";
  switch (n.type) {
    case "NEW_FOLLOWER":
      return { title: "New follower", body: `${who} followed you.`, path: n.actorUsername ? `/u/${n.actorUsername}` : "/notifications" };
    case "FOLLOW_REQUEST":
      return { title: "Follow request", body: `${who} asked to follow you.`, path: "/notifications" };
    case "BOOK_RECOMMENDED":
      return { title: "A book from a friend", body: `${who} sent you ${book(n.bookTitle)}.`, path: "/notifications" };
    case "BUDDY_READ_INVITE":
      return { title: "Reading circle invite", body: `${who} asked you to read ${book(n.bookTitle)} together.`, path: circlePath };
    case "BUDDY_READ_JOINED":
      return { title: "Your reading circle", body: `${who} joined your reading circle for ${book(n.bookTitle)}.`, path: circlePath };
    // Comments the reader can now read: ones their progress just reached, and new ones posted at or before
    // where they are (BOO-43). Counted, never quoted, and not one person's doing, so nobody is named.
    case "COMMENTS_UNLOCKED": {
      const count = n.count ?? 1;
      return {
        title: "New in your reading circle",
        body: `${count === 1 ? "A comment" : `${count} comments`} to read in your reading circle for ${book(n.bookTitle)}.`,
        path: circlePath,
      };
    }
    case "BUDDY_READ_HOSTED":
      return { title: "You're the host now", body: `${who} handed you the reading circle for ${book(n.bookTitle)}.`, path: circlePath };
    // The phone has no page for a book nobody's shelved, so this opens the list, which says which book.
    case "NEW_IN_SERIES":
      return {
        title: "New in your series",
        body: `${seriesNewsText({ title: n.bookTitle, seriesName: n.seriesName ?? null, position: n.seriesPosition ?? null, count: n.count })}.`,
        path: "/notifications",
      };
    case "REVIEW_HIDDEN":
      return { title: "Your review was hidden", body: `We've hidden your review of ${book(n.bookTitle)}. Only you can still see it.`, path: "/notifications" };
    default:
      return null;
  }
}
