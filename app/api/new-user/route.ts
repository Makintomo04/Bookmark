import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { BIO_MAX, DEFAULT_COLOUR, USERNAME_MAX, USERNAME_MIN } from "@/lib/profile";
import { isStorableBanner } from "@/lib/banners";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { attachReferralByUsername } from "@/lib/referrals";
import { REFERRAL_COOKIE } from "@/lib/plusRewards";

// Onboarding's live "is this username free?" check. Usernames are public, so this reveals nothing new.
export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const limit = rateLimit(`username-check:${clientIp(req.headers)}`, 120, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429 });

  const username = (new URL(req.url).searchParams.get("username") ?? "").trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return NextResponse.json({ available: false });
  }
  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return NextResponse.json({ available: !taken || taken.id === currentUser.id });
}

// `field` tells onboarding which step to send the reader back to.
function invalid(error: string, field: string, status = 400) {
  return NextResponse.json({ error, field }, { status });
}

export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const bio = typeof body?.bio === "string" ? body.bio.trim() : "";
  const color = typeof body?.color === "string" && body.color ? body.color : DEFAULT_COLOUR;

  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return invalid(`Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.`, "username");
  }
  if (bio.length > BIO_MAX) {
    return invalid(`Bios are up to ${BIO_MAX} characters.`, "bio");
  }
  if (!isStorableBanner(body?.bannerSrc)) {
    return invalid("That banner pattern doesn't exist.", "banner");
  }

  const taken = await prisma.user.findUnique({ where: { username } });
  if (taken && taken.id !== currentUser.id) {
    return invalid("That username is already taken.", "username", 409);
  }

  try {
    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        username,
        bio,
        favColour: color,
        // Skipped uploads leave what's there, so a Google or GitHub avatar isn't wiped.
        ...(typeof body?.imageSrc === "string" && body.imageSrc ? { image: body.imageSrc } : {}),
        ...(typeof body?.bannerSrc === "string" && body.bannerSrc ? { banner: body.bannerSrc } : {}),
      },
    });
    // Signed up through someone's invite link (app/components/register/SignUpComponent.tsx keeps it).
    const ref = cookies().get(REFERRAL_COOKIE)?.value;
    if (ref) await attachReferralByUsername(user.id, decodeURIComponent(ref), "link").catch((e) => console.error("[referrals]", e));
    const res = NextResponse.json(sanitizeUser(user));
    if (ref) res.cookies.delete(REFERRAL_COOKIE);
    return res;
  } catch (error) {
    // Someone claimed the name between the check and the update.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return invalid("That username is already taken.", "username", 409);
    }
    throw error;
  }
}
