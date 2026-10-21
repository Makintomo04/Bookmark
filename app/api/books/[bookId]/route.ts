import { requireUser } from "@/lib/apiAuth";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// A new cover is copied to UploadThing afterwards, by ./cover.

export async function GET( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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
      coverImage: coverImgSrc || book.coverImage,
      cardColour: cardColour || book.cardColour,
      genre: genre || null,
    }
  })
  return NextResponse.json(updatedBook)
}
export async function DELETE( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId

  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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