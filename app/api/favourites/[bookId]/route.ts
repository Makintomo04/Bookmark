import getCurrentUser from "@/app/actions/getCurrentUser";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST( request: Request,
  { params }: { params: { bookId: string } }) {
  const bookId = params.bookId
if(!bookId){
  return NextResponse.error();
}
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.error();
  }

  const book = await prisma.book.findUnique({
    where:{
      id:bookId
    }
  })
  if(!book){
    return NextResponse.json({ error: 'No Book Found' }, { status: 404 });
  }
  if(book.userId !== currentUser.id){
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where:{
      id:currentUser.id
    }
  })
if(!user){
  return NextResponse.error();
}
  const updatedUser = await prisma.user.update({
    where:{
      id:currentUser.id
    },
    data:{
      favouriteIds: user.favouriteIds.includes(bookId) ? user.favouriteIds.filter(favId => favId !== bookId) : [...user.favouriteIds,bookId]
    }
  })

  return NextResponse.json(sanitizeUser(updatedUser))
}