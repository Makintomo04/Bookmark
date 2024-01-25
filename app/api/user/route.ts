import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import getCurrentUser from "../../actions/getCurrentUser";
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