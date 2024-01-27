import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "../../actions/getCurrentUser";
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

return NextResponse.json(user)


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

// Only perform the update if there are changes
console.log(updatedData);
if (Object.keys(updatedData).length > 0) {
  const user = await prisma.user.update({
    where: {
      id: currentUser.id,
    },
    data: updatedData,
  });

  return NextResponse.json(user);
} else {
  return NextResponse.json({ message: "No changes made." }); // Or handle as needed
}


}