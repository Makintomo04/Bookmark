import { Share } from "react-native";
import type { ClubRole } from "@bookmark/shared/clubs";
import type { ClubVoteStatus } from "@bookmark/shared/clubVotes";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { API_URL } from "@/lib/config";
import type { CircleStatus, Hosting } from "@/lib/circles";

// Book clubs (BOO-49), as the API serves them (the web's useClubs and ClubView). The rules are in
// @bookmark/shared/clubs; each book a club reads is an ordinary reading circle.

export type ClubSummary = {
  id: string;
  name: string;
  about: string | null;
  role: ClubRole;
  memberCount: number;
  current: { id: string; title: string; author: string; coverImage: string | null; cardColour: string | null; startsAt: string; upcoming: boolean } | null;
};

export type ClubList = { hosting: Hosting; clubs: ClubSummary[] };

export type ClubCircle = {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  cardColour: string | null;
  status: CircleStatus;
  startsAt: string;
  memberCount: number;
  // Only a member can open a circle; someone who joined the club after it ended sees it in the list only.
  isMember: boolean;
  myProgress: number | null;
};

export type ClubMember = {
  userId: string;
  username: string | null;
  displayName?: string | null;
  image: string | null;
  favColour: string | null;
  staffBadge?: StaffBadgeKind | null;
  booksRead: number;
  role: ClubRole;
  isYou: boolean;
  joinedAt: string;
  // A host or co-host muted them (BOO-79). Only sent to the hosts and to the member themselves.
  muted?: boolean;
};

export type ClubView = {
  club: { id: string; name: string; about: string | null; status: "ACTIVE" | "ARCHIVED"; hostId: string; createdAt: string; inviteCode: string | null };
  // hostPlus: the host has Plus, so the club takes more than a circle's 15 (BOO-79).
  viewer: { userId: string; role: ClubRole; canManage: boolean; muted?: boolean; hostPlus?: boolean };
  // Everyone in the club (members leaves out anyone the viewer has blocked), and how many it takes.
  memberCount?: number;
  memberCap?: number;
  full?: boolean;
  members: ClubMember[];
  reading: ClubCircle[];
  upcoming: ClubCircle[];
  past: ClubCircle[];
};

export type ClubInviteBook = { title: string; author: string; coverImage: string | null; cardColour: string | null; startsAt: string };

export type ClubInvite = {
  club: { name: string; about: string | null };
  host: { username: string | null; displayName?: string | null; staffBadge?: StaffBadgeKind | null } | null;
  members: { username: string | null; displayName?: string | null; image: string | null; favColour: string | null }[];
  current: ClubInviteBook | null;
  next: ClubInviteBook | null;
  booksRead: number;
  // Everyone in the club; `members` leaves out those a stranger can't see (private profiles, blocks).
  memberCount?: number;
  full: boolean;
  viewer: { isMember: boolean; clubId: string | null; removed: boolean; removedMessage: string | null };
};

export const ROLE_LABEL: Record<ClubRole, string | null> = { host: "Host", cohost: "Co-host", member: null };

// The club's vote on its next book (BOO-49 phase 2), as GET /api/clubs/<id>/votes serves it (the web's
// lib/clubVotesServer.ts loadClubVote). Counts and voters are null until it closes.
export type VotePerson = { userId: string; username: string | null; displayName?: string | null; image: string | null; favColour: string | null; staffBadge?: StaffBadgeKind | null; isYou?: boolean };
export type ClubNomination = {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  cardColour: string | null;
  nominatedBy: VotePerson | null;
  isMine: boolean;
  removable: boolean;
  votes: number | null;
  voters: VotePerson[] | null;
  otherVoters: number | null;
};
export type ClubVoteView = {
  vote: {
    id: string;
    status: ClubVoteStatus;
    hostsOnly: boolean;
    closesAt: string;
    closedAt: string | null;
    winnerId: string | null;
    tiedIds: string[];
    voted: number;
    memberCount: number;
  } | null;
  viewer: { canRun: boolean; canNominate: boolean; canVote: boolean; myBallot: string | null; muted: boolean };
  nominations: ClubNomination[];
};

export const clubInviteUrl = (code: string) => `${API_URL}/clubs/join/${code}`;

// The phone's share sheet with the club's one link (the web's "Copy invite link" on phones).
export function shareClubInvite(code: string, name: string) {
  const url = clubInviteUrl(code);
  return Share.share({ message: `Join ${name} on Bookmark: ${url}`, url }).catch(() => {});
}
