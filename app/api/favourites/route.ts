import getCurrentUser from "@/app/actions/getCurrentUser";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
export async function GET(req:Request, res:Response,) {

  const currentUser = await getCurrentUser()

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