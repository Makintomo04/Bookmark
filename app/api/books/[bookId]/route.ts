import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
export async function GET( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId
  console.log("pppppp",bookId);
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.error();
  }

  const book = await prisma.book.findUnique({
    where: {
      id: bookId
    }
  })
  console.log("ELOOOOO",book,bookId);
  if(!book){
    return NextResponse.json({ error: 'No Book Found' }, { status: 400 });
  }
  return NextResponse.json(book)
}
export async function DELETE( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId
 
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.error();
  }

  const user = await prisma.user.findUnique({
    where: {
      id: currentUser.id
    }
  })

  const book = await prisma.book.delete({
    where: {
      id: bookId
    }
  })
  let updatedUser = {}
  if(user?.favouriteIds.includes(bookId)){
    updatedUser = await prisma.user.update({
      where:{
        id:currentUser.id
      },
      data:{
        favouriteIds: user.favouriteIds.filter(favId => favId !== bookId)
      }
    })
  }
  console.log(book);
  if(!book||!user){
    return NextResponse.error();
  }
  return NextResponse.json({book,updatedUser})
}