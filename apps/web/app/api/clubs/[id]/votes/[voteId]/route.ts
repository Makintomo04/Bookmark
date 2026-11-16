import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { canRunVote, voteActionSchema } from "@/lib/clubVotes";
import { parseBody } from "@/lib/buddyReadsServer";
import { clubError } from "@/lib/clubsServer";
import { cancelVote, closeVote, dismissWinner, findVote, pickWinner } from "@/lib/clubVotesServer";

// The host or a co-host closes the vote early, cancels it, picks the winner of a tie, or puts the winner
// card away without starting the book.
export async function PATCH(req: Request, props: { params: Promise<{ id: string, voteId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const found = await findVote(params.id, params.voteId, currentUser.id);
  if (!found) return clubError("Vote not found", 404);
  if (!canRunVote(found.role) || found.club.status !== "ACTIVE") return clubError("Only the host or a co-host can run the vote.", 403);

  const parsed = await parseBody(req, voteActionSchema);
  if (parsed.response) return parsed.response;
  const action = parsed.data;

  const result = action.action === "close" ? await closeVote(found.vote)
    : action.action === "cancel" ? await cancelVote(found.vote, { by: currentUser.id })
      : action.action === "dismiss" ? await dismissWinner(found.vote)
        : await pickWinner(found.vote, action.nominationId);
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json({ ok: true });
}
