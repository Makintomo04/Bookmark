import { requireUser } from "@/lib/apiAuth";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: Request, props: { params: Promise<{ bookId: string }> }) {
  const params = await props.params;
  const bookId = params.bookId
  if(!bookId){
    return NextResponse.json({ error: 'bookId is required' }, { status: 400 });
  }
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

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
    return NextResponse.json({ error: 'User Not Found' }, { status: 404 });
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