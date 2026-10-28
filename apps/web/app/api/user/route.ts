import { booksReadCount } from "@/lib/readerTier";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { User } from "@prisma/client";
import { BIO_MAX, displayNameProblem, isAllowedImageUrl, isHexColour, normaliseDisplayName, normaliseUsername, usernameProblem } from "@/lib/profile";
import { isStorableBanner } from "@/lib/banners";
import { SubscriptionCancelError, deleteAccount } from "@/lib/accountDeletion";
import { deleteAccountUploads } from "@/lib/uploadedImagesServer";
import { isStripeConfigured, stripeBillingApi } from "@/lib/stripe";
import { deleteBuddyReadDataFor } from "@/lib/buddyReadsServer";
import { revenueCatApi } from "@/lib/storeBilling";
export async function GET (req:Request) {
const { user: currentUser, response } = await requireUser();
if (response) return response;

const user = await prisma.user.findUnique({
  where: {
    id: currentUser.id
  },
  include: booksReadCount,
})
if(!user){
  return NextResponse.json({ error: 'User Not Found' }, { status: 404 });
}

return NextResponse.json(sanitizeUser(user))


}
export async function POST (req:Request) {
const { user: currentUser, response } = await requireUser();
if (response) return response;
const body = await req.json().catch(() => null);
if (!body || typeof body !== "object") {
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
const {imageSrc,bannerSrc,bio,color} = body;
const username = typeof body.username === "string" ? normaliseUsername(body.username) : null;

if (username === null) {
  return NextResponse.json({ error: "Choose a username." }, { status: 400 });
}
// A change of case alone is still saved, so an account from before usernames were normalised comes
// into line the first time its profile is edited. The rules are checked only for a different name,
// so an older name that predates them can still be kept.
const usernameChanged = username !== currentUser.username;
const usernameRenamed = username !== currentUser.username?.toLowerCase();
const usernameError = usernameRenamed ? usernameProblem(username) : null;
if (usernameError) {
  return NextResponse.json({ error: usernameError }, { status: 400 });
}
// Optional: left out keeps what's there, empty clears it (the username shows again).
if (body.displayName != null && typeof body.displayName !== "string") {
  return NextResponse.json({ error: "Invalid display name." }, { status: 400 });
}
const displayName = body.displayName === undefined ? undefined : normaliseDisplayName(body.displayName ?? "");
const displayNameError = displayName ? displayNameProblem(displayName) : null;
if (displayNameError) {
  return NextResponse.json({ error: displayNameError }, { status: 400 });
}
if (bio != null && typeof bio !== "string") {
  return NextResponse.json({ error: "Invalid bio." }, { status: 400 });
}
if (typeof bio === "string" && bio.length > BIO_MAX) {
  return NextResponse.json({ error: `Bios are up to ${BIO_MAX} characters.` }, { status: 400 });
}
if (!isStorableBanner(bannerSrc)) {
  return NextResponse.json({ error: "That banner pattern doesn't exist." }, { status: 400 });
}
if (imageSrc != null && imageSrc !== currentUser.image && !isAllowedImageUrl(imageSrc)) {
  return NextResponse.json({ error: "That picture can't be used. Upload it instead." }, { status: 400 });
}
if (color != null && !isHexColour(color)) {
  return NextResponse.json({ error: "Pick a colour from the list or the picker." }, { status: 400 });
}

const updatedData:Record<string,string | null> = {
};

// Check for changed fields and update data accordingly
if (usernameChanged) {
  updatedData["username"] = username;
}
if (displayName !== undefined && (displayName || null) !== (currentUser.displayName ?? null)) {
  updatedData["displayName"] = displayName || null;
}
if (imageSrc !== currentUser.image) {
  updatedData["image"] = imageSrc ?? null;
}
if (bannerSrc !== currentUser.banner) {
  updatedData["banner"] = bannerSrc ?? null;
}
if (bio !== undefined && bio !== currentUser.bio) {
  updatedData["bio"] = bio;
}
if (color != null && color !== currentUser.favColour) {
  updatedData["favColour"] = color;
}

if (updatedData.username) {
  // Case-insensitive, so a new "alice" can't sit beside an older "Alice".
  const existingUser = await prisma.user.findFirst({ where: { username: { equals: updatedData.username, mode: "insensitive" }, NOT: { id: currentUser.id } }, select: { id: true } });
  if (existingUser && existingUser.id !== currentUser.id) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }
}

// Only perform the update if there are changes
if (Object.keys(updatedData).length > 0) {
  const user = await prisma.user.update({
    where: {
      id: currentUser.id,
    },
    data: updatedData,
  });

  return NextResponse.json(sanitizeUser(user));
} else {
  return NextResponse.json({ message: "No changes made." }); // Or handle as needed
}


}

export async function DELETE(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  try {
    await deleteAccount(currentUser, {
      db: prisma,
      cancelSubscription: isStripeConfigured() ? (id) => stripeBillingApi().cancelSubscription(id) : undefined,
      deleteCircleData: deleteBuddyReadDataFor,
      deleteStoreCustomer: (id) => revenueCatApi()?.deleteSubscriber(id) ?? Promise.resolve(),
      deleteUploads: deleteAccountUploads,
    });
  } catch (err) {
    if (err instanceof SubscriptionCancelError) {
      console.error(`[account] couldn't cancel the subscription for user ${currentUser.id}, nothing deleted:`, err.message);
      return NextResponse.json(
        { error: "We couldn't cancel your Plus subscription, so your account hasn't been deleted. Please try again in a few minutes." },
        { status: 502 }
      );
    }
    throw err;
  }

  return NextResponse.json({ message: "Account deleted." });
}
