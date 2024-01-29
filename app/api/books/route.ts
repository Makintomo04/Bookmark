import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";
import { parse } from "path";

export async function GET(req:Request, res:Response) {

const currentUser = await getCurrentUser()

if (!currentUser) {
  return NextResponse.error();
}

const books = await prisma.book.findMany({
  where:{
    userId: currentUser.id
  },
  include:{
     
  }
})
return NextResponse.json(books)
}
export async function POST(req:Request, res:Response) {

  const body = await req.json()
  const {title, author, coverImgSrc,pages,isStarted,currentPage,startedAt,cardColour } = body
const currentUser = await getCurrentUser()

if (!currentUser) {
  return NextResponse.error();
}

const readingStatus = isStarted ? "STARTED" : "NOT_STARTED"
console.log(typeof(parseInt(pages)));
const book = await prisma.book.create({
  data:{  
    userId: currentUser.id,
    title,
    author,
    coverImage:coverImgSrc,
    startedAt: readingStatus === "NOT_STARTED" ? null : new Date(startedAt),
    pages:parseInt(pages),
    status: readingStatus,
    currentPage:parseInt(currentPage),
    cardColour, 
  }
})
return NextResponse.json(book)
}