import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { BIO_MAX, USERNAME_MAX, USERNAME_MIN } from "@/lib/profile";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const DEFAULT_COLOUR = "rgba(241, 60, 60, 1)";

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
    return NextResponse.json(sanitizeUser(user));
  } catch (error) {
    // Someone claimed the name between the check and the update.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return invalid("That username is already taken.", "username", 409);
    }
    throw error;
  }
}
