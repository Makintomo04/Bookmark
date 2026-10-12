import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "../../actions/getCurrentUser";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { User } from "@prisma/client";
export async function GET (req:Request, res:Response) {
const currentUser = await getCurrentUser();

if (!currentUser) {
  return NextResponse.error();
}

const user = await prisma.user.findUnique({
  where: {
    id: currentUser.id
  }
})
if(!user){
  return NextResponse.json({ error: 'User Not Found' }, { status: 404 });
}

return NextResponse.json(sanitizeUser(user))


}
export async function POST (req:Request, res:Response) {
  const body = await req.json();
const currentUser = await getCurrentUser();
const {username,imageSrc,bannerSrc,bio,color} = body;
if (!currentUser) {
  return NextResponse.error();
}

const updatedData:Record<string,string> = {
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