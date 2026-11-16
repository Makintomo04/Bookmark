import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { ballotSchema } from "@/lib/clubVotes";
import { parseBody } from "@/lib/buddyReadsServer";
import { clubError } from "@/lib/clubsServer";
import { castBallot, findVote } from "@/lib/clubVotesServer";

// A member's vote: one book, changed as often as they like until the vote closes. A host-muted member still
// votes (lib/clubs.ts CLUB_MUTED_MESSAGE).
export async function PUT(req: Request, props: { params: Promise<{ id: string, voteId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const found = await findVote(params.id, params.voteId, currentUser.id);
  if (!found) return clubError("Vote not found", 404);
  if (found.club.status !== "ACTIVE") return clubError("This club has closed.", 410);

  const parsed = await parseBody(req, ballotSchema);
  if (parsed.response) return parsed.response;

  const limit = rateLimit(`club-ballot:${currentUser.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return clubError(tooManyRequestsMessage, 429);

  const result = await castBallot(found.vote, currentUser.id, parsed.data.nominationId);
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json({ nominationId: parsed.data.nominationId });
}
