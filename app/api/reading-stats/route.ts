import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req:Request, res:Response) {

const currentUser = await getCurrentUser()

if (!currentUser) {
  return NextResponse.error();
}

const readingStats = await prisma.book.aggregate({
  // _count: {
  //   status: true, // Use the $sum operator within the _count field
  // },
  // include:{
  //   _count:{
  //     status:true
  //   }
  // }
});
return NextResponse.json(readingStats)
}