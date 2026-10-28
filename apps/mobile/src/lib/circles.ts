import { Share } from "react-native";
import type { BuddyReadSchedule, SerializedComment } from "@bookmark/shared/buddyReads";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";

// Reading circles, as the API serves them (the web's useBuddyReads and BuddyReadView).

export type CircleStatus = "ACTIVE" | "FINISHED" | "ARCHIVED";

export type CircleSummary = {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  cardColour: string | null;
  status: CircleStatus;
  startsAt: string;
  isHost: boolean;
  myProgress: number;
  members: { userId: string; username: string | null; displayName?: string | null; image: string | null; favColour: string | null; progress: number }[];
};

export type Hosting = { allowed: boolean; active: number; limit: number | null; plan: "free" | "plus"; upgrade: boolean; message: string | null };

export type CircleInvite = {
  id: string;
  createdAt: string;
  inviter: { username: string | null; displayName?: string | null; image: string | null; favColour: string | null };
  buddyRead: { id: string; title: string; author: string; coverImage: string | null; cardColour: string | null; inviteCode: string };
};

export type CircleList = { buddyReads: CircleSummary[]; hosting: Hosting | null; invites: CircleInvite[] };

export type CircleMember = {
  userId: string;
  username: string | null;
  displayName?: string | null;
  image: string | null;
  favColour: string | null;
  booksRead: number;
  progress: number;
  isHost: boolean;
  isYou: boolean;
  joinedAt: string;
  finishedAt: string | null;
};

export type CircleView = {
  buddyRead: {
    id: string;
    title: string;
    author: string;
    coverImage: string | null;
    cardColour: string | null;
    pages: number;
    startsAt: string;
    status: CircleStatus;
    schedule: BuddyReadSchedule | null;
    hostId: string;
    inviteCode: string;
  };
  viewer: { userId: string; progress: number; isHost: boolean; bookId: string; muted: boolean };
  members: CircleMember[];
  comments: SerializedComment[];
};

export const inviteUrl = (code: string) => `${API_URL}/circles/join/${code}`;

// A friend, as /api/friends lists them: a reader you follow who follows you back.
export type Friend = { username: string | null; image: string | null; favColour: string | null };

// Invite a reader by username (the web's invite box and friends picker): lands in their notifications if
// their settings allow it; the server says why not otherwise.
export function inviteToCircle(circleId: string, username: string) {
  return api.post<{ invited: boolean }>(`/api/buddy-reads/${circleId}/invite`, { username });
}

// The phone's share sheet with the invite link (the web's InvitePanel on phones).
export function shareInvite(code: string, title: string) {
  const url = inviteUrl(code);
  return Share.share({ message: `Read ${title} with me on Bookmark: ${url}`, url }).catch(() => {});
}
