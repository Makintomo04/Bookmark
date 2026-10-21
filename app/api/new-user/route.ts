import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
export async function POST(req:Request,res:Response){
  const body = await req.json();
  const {username,imageSrc,bannerSrc,bio,color} = body;
  const { user: currentUser, response } = await requireUser();
  if (response) return response;
  const user = await prisma.user.update({
    where:{
      id: currentUser.id
    },
    data:{
      username,
      image:imageSrc,
      banner:bannerSrc,
      bio,
      favColour:color
    }
})
return NextResponse.json(sanitizeUser(user))
}