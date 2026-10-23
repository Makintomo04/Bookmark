import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { BIO_MAX, DEFAULT_COLOUR, isAllowedImageUrl, isHexColour, normaliseUsername, usernameProblem } from "@/lib/profile";
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

  const username = normaliseUsername(new URL(req.url).searchParams.get("username") ?? "");
  const problem = usernameProblem(username);
  if (problem) return NextResponse.json({ available: false, error: problem });
  const taken = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" }, NOT: { id: currentUser.id } }, select: { id: true } });
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
  const username = typeof body?.username === "string" ? normaliseUsername(body.username) : "";
  const bio = typeof body?.bio === "string" ? body.bio.trim() : "";
  const color = typeof body?.color === "string" && body.color ? body.color : DEFAULT_COLOUR;

  // Onboarding sets the name the first time, so it always meets the rules (lib/profile.ts).
  const usernameError = usernameProblem(username);
  if (usernameError) return invalid(usernameError, "username");
  if (!isHexColour(color)) return invalid("Pick a colour from the list or the picker.", "color");
  if (body?.imageSrc && !isAllowedImageUrl(body.imageSrc)) return invalid("That picture can't be used. Upload it instead.", "image");
  if (bio.length > BIO_MAX) {
    return invalid(`Bios are up to ${BIO_MAX} characters.`, "bio");
  }
  if (!isStorableBanner(body?.bannerSrc)) {
    return invalid("That banner pattern doesn't exist.", "banner");
  }

  // Case-insensitive, so a new "alice" can't sit beside an older "Alice".
  const taken = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" }, NOT: { id: currentUser.id } }, select: { id: true } });
  if (taken) {
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
    // Signed up through someone's invite link: the web keeps it in a cookie (app/components/register/
    // SignUpComponent.tsx), the mobile app sends it as `ref`.
    const cookieRef = cookies().get(REFERRAL_COOKIE)?.value;
    const ref = cookieRef ? decodeURIComponent(cookieRef) : typeof body?.ref === "string" ? body.ref.trim().slice(0, 64) : "";
    if (ref) await attachReferralByUsername(user.id, ref, "link").catch((e) => console.error("[referrals]", e));
    const res = NextResponse.json(sanitizeUser(user));
    if (cookieRef) res.cookies.delete(REFERRAL_COOKIE);
    return res;
  } catch (error) {
    // Someone claimed the name between the check and the update.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return invalid("That username is already taken.", "username", 409);
    }
    throw error;
  }
}
