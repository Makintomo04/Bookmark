import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req:Request, res:Response) {

  const body = await req.json()
  const {id,pagesUpdate,isComplete,isStarted} = body
  console.log("22222",id,body);
const currentUser = await getCurrentUser()

if (!id) {
  return NextResponse.error();
}
if (!currentUser) {
  return NextResponse.error();
}

const selectedBook = await prisma.book.findUnique({
  where:{
    id
  }
})
if(!selectedBook){
  return NextResponse.json({ error: 'Book Not Found' }, { status: 500 })
}
const increment = (currentPage:number, pagesToIncrement:string) => {
  return currentPage + parseInt(pagesToIncrement)
}
console.log("099999999999",selectedBook.status);
if(selectedBook.status === "NOT_STARTED"){
  if(isStarted && !isComplete){
    const book = await prisma.book.update({
      where:{
        id
      },
      data:{  
        currentPage: pagesUpdate ? increment(0,pagesUpdate) : 0,
        status: isStarted ? "STARTED" : selectedBook.status,
        startedAt: isStarted ? new Date() : selectedBook.startedAt,
      }
    })
    return NextResponse.json({book,message:"Book Started"})
  }
  return NextResponse.json({ error: 'Book not started' }, { status: 400 })
  // return NextResponse.json({error:"Book not started"});
}
console.log("yooo",isComplete,parseInt(pagesUpdate) ,typeof(parseInt(pagesUpdate) ));
if(selectedBook.status === "STARTED" && !isComplete && isNaN(parseInt(pagesUpdate))){
  return NextResponse.json({error:"Pages to increment must be greater than 0"});
}
const book = await prisma.book.update({
  where:{
    id
  },
  data:{  
    currentPage: pagesUpdate && !isComplete ? increment(selectedBook.currentPage ?? 0,pagesUpdate) : selectedBook.pages,
    status: isComplete ? "COMPLETED" : selectedBook.status ==="COMPLETED" && !isComplete ? "STARTED": selectedBook.status,
    completedAt: isComplete ? new Date() : selectedBook.completedAt,
  }
})
return NextResponse.json(book)
}