import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { mirrorCover } from "@/lib/covers";
import { NextResponse } from "next/server";

// Copying a cover to UploadThing can take up to ~20s.
export const maxDuration = 30;

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
  const {title, author, coverImgSrc,pages,isStarted,currentPage,startedAt,cardColour,genre } = body
const currentUser = await getCurrentUser()

if (!currentUser) {
  return NextResponse.error();
}
const user = await prisma.user.findUnique({
  where:{
    id:currentUser.id
  }
})
if(!user){
  return NextResponse.error();
}

const readingStatus = isStarted ? "STARTED" : "NOT_STARTED"
const book = await prisma.book.create({
  data:{
    userId: currentUser.id,
    title,
    author,
    coverImage: coverImgSrc ? await mirrorCover(coverImgSrc) : "",
    startedAt: readingStatus === "NOT_STARTED" ? null : new Date(startedAt),
    pages:parseInt(pages),
    status: readingStatus,
    currentPage: readingStatus === "NOT_STARTED" ? 0 : parseInt(currentPage),
    cardColour: cardColour || "#f44336",
    genre: genre || null,
  }
})
await prisma.activity.create({
  data: {
    userId: currentUser.id,
    bookId: book.id,
    type: readingStatus === "STARTED" ? "STARTED_BOOK" : "ADDED_BOOK",
  }
})
return NextResponse.json(book)
}