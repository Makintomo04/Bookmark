import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";
export async function POST(req:Request,res:Response){
  const body = await req.json();
  const {username,imageSrc,bannerSrc,bio,color} = body;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.error();
  }
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
return NextResponse.json(user)
}