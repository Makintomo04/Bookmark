import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { canRunVote } from "@/lib/clubVotes";
import { clubError } from "@/lib/clubsServer";
import { findVote, winnerCopyFor } from "@/lib/clubVotesServer";

// "Start this book": puts the winner on the host's (or co-host's) shelf if it isn't there, in Want to read,
// and answers with its id so the usual start form (/circles/new?clubId=&bookId=) can take it from there.
export async function POST(_req: Request, props: { params: Promise<{ id: string, voteId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const found = await findVote(params.id, params.voteId, currentUser.id);
  if (!found) return clubError("Vote not found", 404);
  if (!canRunVote(found.role) || found.club.status !== "ACTIVE") return clubError("Only the host or a co-host can start the next book.", 403);

  const result = await winnerCopyFor(found.vote, currentUser.id);
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json({ bookId: result.bookId });
}
