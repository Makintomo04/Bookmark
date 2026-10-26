import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiAuth";
import { findSeries, setFollowingSeries } from "@/lib/seriesFollows";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";

const bodySchema = z.object({ name: z.string().trim().min(1).max(300), author: z.string().trim().min(1).max(300) });

// Follow (PUT) or unfollow (DELETE) a series, named by { name, author }. Free, and the same on web and in
// the app. The series is looked up in the catalog rather than trusted from the client.
async function setFollowing(req: Request, following: boolean) {
  const { user, response } = await requireUser("Sign in to follow a series.");
  if (response) return response;
  const limit = rateLimit(`series-follow:${user.id}`, 120, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say which series." }, { status: 400 });
  const series = await findSeries(parsed.data.name, parsed.data.author);
  if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });

  await setFollowingSeries(user.id, series, following);
  return NextResponse.json({ key: series.key, isFollowing: following });
}

export async function PUT(req: Request) {
  return setFollowing(req, true);
}

export async function DELETE(req: Request) {
  return setFollowing(req, false);
}
