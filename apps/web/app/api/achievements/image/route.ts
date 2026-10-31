import { findEarnedMedal } from "@bookmark/shared/medalShare";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { medalOgImage } from "@/app/components/achievements/medalImage";

// The signed-in reader's own medal card as a PNG, for the app's Save to Photos. The public card
// (/u/<username>/medals/<medal>/opengraph-image) only draws for public profiles, since crawlers have no
// session; this one draws for its owner whatever their privacy.
//   GET /api/achievements/image?medal=BOOKS_READ-50
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!user.username) return new Response("Not found", { status: 404 });

  const slug = new URL(req.url).searchParams.get("medal") ?? "";
  const earned = await prisma.userAchievement.findMany({ where: { userId: user.id }, select: { key: true, earnedAt: true } });
  const medal = findEarnedMedal(earned, slug);
  if (!medal) return new Response("Not found", { status: 404 });

  const image = await medalOgImage({ username: user.username, displayName: user.displayName, achievement: medal.achievement, milestone: medal.milestone });
  image.headers.set("Cache-Control", "private, max-age=300");
  return image;
}
