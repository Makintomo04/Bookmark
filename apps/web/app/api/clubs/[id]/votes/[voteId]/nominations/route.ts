import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { CLUB_MUTED_MESSAGE } from "@/lib/clubs";
import { canNominate, nominateSchema } from "@/lib/clubVotes";
import { parseBody } from "@/lib/buddyReadsServer";
import { clubError } from "@/lib/clubsServer";
import { findVote, nominate } from "@/lib/clubVotesServer";

// Puts a book from the member's shelf up for the vote: one each, ten in all. Not while a host has muted
// them, and only the host and co-hosts when the vote is a shortlist.
export async function POST(req: Request, props: { params: Promise<{ id: string, voteId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const found = await findVote(params.id, params.voteId, currentUser.id);
  if (!found) return clubError("Vote not found", 404);
  if (found.club.status !== "ACTIVE") return clubError("This club has closed.", 410);
  if (found.member.hostMutedAt) return clubError(CLUB_MUTED_MESSAGE, 403);
  if (!canNominate(found.role, { hostsOnly: found.vote.hostsOnly, muted: false })) return clubError("The host is choosing the books for this vote. You can still vote.", 403);

  const parsed = await parseBody(req, nominateSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`club-nominate:${currentUser.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  const result = await nominate(found.vote, currentUser.id, parsed.data.bookId);
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json({ id: result.nominationId });
}
