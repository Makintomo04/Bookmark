import { requireUser } from "@/lib/apiAuth";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
export async function GET(req:Request, res:Response,) {

  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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