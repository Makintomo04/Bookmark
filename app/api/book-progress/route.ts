import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req:Request, res:Response) {

  const body = await req.json()
  const {id,pagesUpdate,isComplete} = body
const currentUser = await getCurrentUser()

if (!currentUser) {
  return NextResponse.error();
}

const selectedBook = await prisma.book.findUnique({
  where:{
    id
  }
})
const increment = (currentPage:number, pagesToIncrement:string) => {
  return currentPage + parseInt(pagesToIncrement)
}
if(!selectedBook || !selectedBook?.currentPage){
  return NextResponse.error();
}

  if(parseInt(pagesUpdate) <= 0 || isNaN(parseInt(pagesUpdate))){
    return NextResponse.json({error:"Pages to increment must be greater than 0"});
  }

const book = await prisma.book.update({
  where:{
    id
  },
  data:{  
    currentPage: increment(selectedBook.currentPage,pagesUpdate),
    status: isComplete ? "COMPLETED" : selectedBook.status
  }
})
return NextResponse.json(book)
}