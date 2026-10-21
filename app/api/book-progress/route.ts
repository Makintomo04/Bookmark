import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { awardNewAchievements } from "@/lib/achievements";
import { NextResponse } from "next/server";

export async function POST(req:Request, res:Response) {

  const body = await req.json()
  const {id,pagesUpdate,isComplete,isStarted,rating,review,isRestart,currentPage:targetPage} = body
  // An absolute page is idempotent, unlike pagesUpdate (an increment), so retries can't double-count.
  const hasTarget = typeof targetPage === "number" && Number.isFinite(targetPage)
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
  return NextResponse.json({ error: 'Book Not Found' }, { status: 404 })
}
if(selectedBook.userId !== currentUser.id){
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
const clampPage = (page:number) => Math.max(0, Math.min(selectedBook.pages, Math.round(page)))
const increment = (currentPage:number, pagesToIncrement:string, maxPages:number) => {
  const next = currentPage + parseInt(pagesToIncrement)
  return Math.max(0, Math.min(maxPages, next))
}
const logActivity = async (type: "STARTED_BOOK" | "COMPLETED_BOOK" | "RATED_BOOK" | "REVIEWED_BOOK") => {
  await prisma.activity.create({ data: { userId: currentUser.id, bookId: id, type } })
}
if(review !== undefined && typeof review === "string" && review.length > 2000){
  return NextResponse.json({error:"Review must be 2000 characters or fewer"}, { status: 400 });
}
if(isRestart){
  if(selectedBook.status !== "COMPLETED"){
    return NextResponse.json({ error: 'Only a completed book can be read again' }, { status: 400 })
  }
  const book = await prisma.book.update({
    where:{
      id
    },
    data:{
      status: "STARTED",
      currentPage: 0,
      startedAt: new Date(),
      completedAt: null,
      rating: rating !== undefined ? rating : selectedBook.rating,
      review: review !== undefined ? review : selectedBook.review,
    }
  })
  await logActivity("STARTED_BOOK")
  await awardNewAchievements(currentUser.id)
  return NextResponse.json({book,message:"Reading Again"})
}
if(selectedBook.status === "NOT_STARTED"){
  if(isStarted && !isComplete){
    const book = await prisma.book.update({
      where:{
        id
      },
      data:{
        currentPage: hasTarget ? clampPage(targetPage) : pagesUpdate ? increment(0,pagesUpdate,selectedBook.pages) : 0,
        status: isStarted ? "STARTED" : selectedBook.status,
        startedAt: isStarted ? new Date() : selectedBook.startedAt,
        rating: rating !== undefined ? rating : selectedBook.rating,
        review: review !== undefined ? review : selectedBook.review,
      }
    })
    await logActivity("STARTED_BOOK")
    if(rating !== undefined && rating > 0 && rating !== selectedBook.rating) await logActivity("RATED_BOOK")
    if(review !== undefined && typeof review === "string" && review.trim().length > 0 && review !== selectedBook.review) await logActivity("REVIEWED_BOOK")
    await awardNewAchievements(currentUser.id)
    return NextResponse.json({book,message:"Book Started"})
  }
  return NextResponse.json({ error: 'Book not started' }, { status: 400 })
}
if(selectedBook.status === "STARTED" && !isComplete && !hasTarget && isNaN(parseInt(pagesUpdate))){
  return NextResponse.json({error:"Pages to increment must be greater than 0"}, { status: 400 });
}
const isFirstCompletion = isComplete && selectedBook.status !== "COMPLETED"
const book = await prisma.book.update({
  where:{
    id
  },
  data:{
    currentPage: !isComplete && hasTarget ? clampPage(targetPage)
      : pagesUpdate && !isComplete ? increment(selectedBook.currentPage ?? 0,pagesUpdate,selectedBook.pages)
      : selectedBook.pages,
    status: isComplete ? "COMPLETED" : selectedBook.status ==="COMPLETED" && !isComplete ? "STARTED": selectedBook.status,
    completedAt: isFirstCompletion ? new Date() : selectedBook.completedAt,
    timesRead: isFirstCompletion ? selectedBook.timesRead + 1 : selectedBook.timesRead,
    rating: rating !== undefined ? rating : selectedBook.rating,
    review: review !== undefined ? review : selectedBook.review,
  }
})
if(isFirstCompletion) await logActivity("COMPLETED_BOOK")
if(rating !== undefined && rating > 0 && rating !== selectedBook.rating) await logActivity("RATED_BOOK")
if(review !== undefined && typeof review === "string" && review.trim().length > 0 && review !== selectedBook.review) await logActivity("REVIEWED_BOOK")
await awardNewAchievements(currentUser.id)
return NextResponse.json(book)
}