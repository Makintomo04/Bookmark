import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req:Request, res:Response) {

const currentUser = await getCurrentUser()

if (!currentUser) {
  return NextResponse.error();
}

const books = await prisma.book.findMany({
  where:{
    userId: currentUser.id
  }
})
return NextResponse.json(books)
}