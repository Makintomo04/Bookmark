import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { peopleYouMayKnow } from "@/lib/peopleSuggest";
import { SUGGESTION_LIMIT } from "@bookmark/shared/peopleSuggest";
import { NextResponse } from "next/server";

// People you may know (BOO-81, lib/peopleSuggest.ts).
//   GET /api/users/suggestions?limit=6  → { people, followingCount }
// followingCount lets the feed decide whether to offer them (feedShowsSuggestions).
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const asked = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(SUGGESTION_LIMIT, Math.floor(asked)) : SUGGESTION_LIMIT;
  const [people, followingCount] = await Promise.all([
    peopleYouMayKnow({ id: user.id }, { limit }),
    prisma.follow.count({ where: { followerId: user.id } }),
  ]);
  return NextResponse.json({ people, followingCount });
}
