import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { canRunVote, openVoteSchema } from "@/lib/clubVotes";
import { parseBody } from "@/lib/buddyReadsServer";
import { clubError, requireClubMembership } from "@/lib/clubsServer";
import { loadClubVote, openVote } from "@/lib/clubVotesServer";

// The club's vote on its next book (BOO-49 phase 2): the one open, or tied, or the winner waiting to be
// started. Counts only once it's closed (lib/clubVotes.ts countsVisible).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const view = await loadClubVote(params.id, currentUser.id);
  if (!view) return clubError("Club not found", 404);
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}

// The host or a co-host opens a vote: how many days it runs, and whether only they nominate. Everyone in
// the club is told.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const { membership, response: notMember } = await requireClubMembership(params.id, currentUser.id);
  if (notMember) return notMember;
  if (!canRunVote(membership.role) || membership.club.status !== "ACTIVE") return clubError("Only the host or a co-host can open a vote.", 403);

  const parsed = await parseBody(req, openVoteSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`club-vote-open:${currentUser.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  const result = await openVote(membership.club.id, currentUser.id, parsed.data);
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json({ id: result.voteId });
}
