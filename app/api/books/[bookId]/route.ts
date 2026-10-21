import getCurrentUser from "@/app/actions/getCurrentUser";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { mirrorCover } from "@/lib/covers";

// Copying a cover to UploadThing can take up to ~20s.
export const maxDuration = 30;

export async function GET( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.error();
  }

  const book = await prisma.book.findUnique({
    where: {
      id: bookId
    }
  })
  if(!book){
    return NextResponse.json({ error: 'No Book Found' }, { status: 404 });
  }
  if(book.userId !== currentUser.id){
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(book)
}
export async function PATCH( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.error();
  }

  const book = await prisma.book.findUnique({
    where: {
      id: bookId
    }
  })
  if(!book){
    return NextResponse.json({ error: 'No Book Found' }, { status: 404 });
  }
  if(book.userId !== currentUser.id){
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json()
  const { title, author, pages, coverImgSrc, cardColour, genre } = body
  if(!title || !author || !pages){
    return NextResponse.json({ error: 'Title, author and pages are required' }, { status: 400 });
  }

  const updatedBook = await prisma.book.update({
    where: {
      id: bookId
    },
    data: {
      title,
      author,
      pages: parseInt(pages),
      // Only a newly chosen cover is copied; ones already saved are left to scripts/migrate-covers.ts.
      coverImage: coverImgSrc && coverImgSrc !== book.coverImage ? await mirrorCover(coverImgSrc) : book.coverImage,
      cardColour: cardColour || book.cardColour,
      genre: genre || null,
    }
  })
  return NextResponse.json(updatedBook)
}
export async function DELETE( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.error();
  }

  const book = await prisma.book.findUnique({
    where: {
      id: bookId
    }
  })
  if(!book){
    return NextResponse.json({ error: 'No Book Found' }, { status: 404 });
  }
  if(book.userId !== currentUser.id){
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: currentUser.id
    }
  })

  await prisma.book.delete({
    where: {
      id: bookId
    }
  })

  let updatedUser = {}
  if(user?.favouriteIds.includes(bookId)){
    const rawUpdatedUser = await prisma.user.update({
      where:{
        id:currentUser.id
      },
      data:{
        favouriteIds: user.favouriteIds.filter(favId => favId !== bookId)
      }
    })
    updatedUser = sanitizeUser(rawUpdatedUser)
  }
  return NextResponse.json({book,updatedUser})
}