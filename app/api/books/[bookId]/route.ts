import { requireUser } from "@/lib/apiAuth";
import { sanitizeUser } from "@/lib/sanitizeUser";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { EditionFormat } from "@prisma/client";
import { convertPosition, progressScale } from "@/lib/progress";
import { parseAudioMinutes } from "@/lib/bookInput";

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
  const { title, author, pages, coverImgSrc, cardColour, genre, format, audioMinutes } = body
  // Format and running time decide the unit: an audiobook with a running time runs on minutes.
  // Older clients send neither, which leaves the book's scale as it is.
  const parsedFormat = Object.values(EditionFormat).includes(format) ? (format as EditionFormat) : null
  const wantsMinutes = format === undefined ? book.progressUnit === "MINUTES" : parsedFormat === "AUDIOBOOK"
  const runningTime = wantsMinutes ? (audioMinutes === undefined ? book.audioMinutes : parseAudioMinutes(audioMinutes)) : null
  const totalPages = pages === undefined || pages === null || pages === "" ? 0 : parseInt(pages)
  if(!title || !author){
    return NextResponse.json({ error: 'Title and author are required' }, { status: 400 });
  }
  if (wantsMinutes && !runningTime) {
    return NextResponse.json({ error: "Enter the audiobook's running time" }, { status: 400 });
  }
  if (!wantsMinutes && !(totalPages > 0)) {
    return NextResponse.json({ error: 'Title, author and pages are required' }, { status: 400 });
  }
  if (isNaN(totalPages) || totalPages < 0) {
    return NextResponse.json({ error: 'Pages must be a number' }, { status: 400 });
  }

  // Changing the scale keeps the reader's place as a percent, so a circle doesn't see them drop to 0.
  const before = progressScale(book)
  const after = { unit: wantsMinutes ? "MINUTES" : "PAGES", total: wantsMinutes ? runningTime ?? 0 : totalPages } as const
  const moved = before.unit !== after.unit && before.total > 0 && before.current > 0
  const position = moved ? convertPosition(before.current, before.total, after.total) : null
  const open = book.status === "STARTED" || book.status === "PAUSED"

  const updatedBook = await prisma.book.update({
    where: {
      id: bookId
    },
    data: {
      title,
      author,
      pages: totalPages,
      coverImage: coverImgSrc || book.coverImage,
      cardColour: cardColour || book.cardColour,
      genre: genre || null,
      progressUnit: wantsMinutes ? "MINUTES" : book.progressUnit ? "PAGES" : undefined,
      audioMinutes: runningTime,
      ...(position !== null && (wantsMinutes ? { currentMinute: position } : { currentPage: position })),
      // The open read mirrors the book's scale.
      ...(open && {
        reads: {
          updateMany: {
            where: { status: { in: ["STARTED", "PAUSED"] } },
            data: {
              progressUnit: wantsMinutes ? "MINUTES" : "PAGES",
              audioMinutes: runningTime,
              currentMinute: wantsMinutes ? position ?? book.currentMinute ?? 0 : null,
            },
          },
        },
      }),
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