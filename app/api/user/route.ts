import { booksReadCount } from "@/lib/readerTier";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "../../actions/getCurrentUser";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { User } from "@prisma/client";
import { BIO_MAX, USERNAME_MAX, USERNAME_MIN } from "@/lib/profile";
export async function GET (req:Request, res:Response) {
const currentUser = await getCurrentUser();

if (!currentUser) {
  return NextResponse.error();
}

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
export async function POST (req:Request, res:Response) {
  const body = await req.json();
const currentUser = await getCurrentUser();
const {imageSrc,bannerSrc,bio,color} = body;
const username = typeof body.username === "string" ? body.username.trim() : body.username;
if (!currentUser) {
  return NextResponse.error();
}

if (typeof username !== "string" || username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
  return NextResponse.json({ error: `Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.` }, { status: 400 });
}
if (typeof bio === "string" && bio.length > BIO_MAX) {
  return NextResponse.json({ error: `Bios are up to ${BIO_MAX} characters.` }, { status: 400 });
}

const updatedData:Record<string,string | null> = {
};

// Check for changed fields and update data accordingly
if (username !== currentUser.username) {
  updatedData["username"] = username;
}
if (imageSrc !== currentUser.image) {
  updatedData["image"] = imageSrc;
}
if (bannerSrc !== currentUser.banner) {
  updatedData["banner"] = bannerSrc;
}
if (body.bio !== currentUser.bio) {
  updatedData["bio"] = bio;
}
if (color !== currentUser.favColour) {
  updatedData["favColour"] = color;
}

if (updatedData.username) {
  const existingUser = await prisma.user.findUnique({ where: { username: updatedData.username } });
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
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.error();
  }

  // Mongo doesn't enforce cascade deletes at the database level the way a
  // relational DB would, so clean up everything referencing this user
  // explicitly rather than relying on the schema's onDelete: Cascade alone.
  await prisma.note.deleteMany({ where: { book: { userId: currentUser.id } } });
  await prisma.activity.deleteMany({ where: { OR: [{ userId: currentUser.id }, { book: { userId: currentUser.id } }] } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: currentUser.id }, { actorId: currentUser.id }] } });
  await prisma.book.deleteMany({ where: { userId: currentUser.id } });
  await prisma.readingGoal.deleteMany({ where: { userId: currentUser.id } });
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: currentUser.id }, { followingId: currentUser.id }] } });
  await prisma.account.deleteMany({ where: { userId: currentUser.id } });
  await prisma.session.deleteMany({ where: { userId: currentUser.id } });
  await prisma.user.delete({ where: { id: currentUser.id } });

  return NextResponse.json({ message: "Account deleted." });
}
