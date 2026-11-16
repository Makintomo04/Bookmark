import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { canRunVote } from "@/lib/clubVotes";
import { isObjectId } from "@/lib/buddyReadsServer";
import { clubError } from "@/lib/clubsServer";
import { findVote, removeNomination } from "@/lib/clubVotesServer";

// Takes a book down: the member who put it up, or the host or a co-host. Its votes go with it.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string, voteId: string, nominationId: string }> }) {
  const params = await props.params;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const found = await findVote(params.id, params.voteId, currentUser.id);
  if (!found || !isObjectId(params.nominationId)) return clubError("Vote not found", 404);

  const result = await removeNomination(found.vote, params.nominationId, { userId: currentUser.id, canRun: canRunVote(found.role) && found.club.status === "ACTIVE" });
  if (!result.ok) return clubError(result.error, result.status);
  return NextResponse.json({ ok: true });
}
