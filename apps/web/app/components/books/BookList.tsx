"use client"
import useBookEntryModal from '@/app/hooks/useBookEntryModal';
import useUser from '@/app/hooks/useUser';
import { FC } from 'react'
import Loader from '../Loader';
import { Book } from '@prisma/client';
import useBooks from '@/app/hooks/useBooks';
import Link from 'next/link';
import { Compass, FileUp, Plus } from 'lucide-react';
import { AiLabel } from '../discover/AskShelf';
import { readableInk } from '@/lib/colour';
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader';
import BookGrid from './BookGrid';
import FetchErrorState from '../FetchErrorState';
import { ShelvesSkeleton } from '../profile-head/ProfileSkeleton';
// `slot`: one part of the shelf on your profile in bands. See BookGrid.
const BookList: FC<{ slot?: 'results' | 'shelves' }> = ({ slot }) => {
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks,mutate:mutateBooks} = useBooks();
  const {user,isLoading,isError} = useUser();
  const bookEntryModal = useBookEntryModal()
  // if (isLoadingBooks) {
  //   return (
  //     <div className="">
  //       <Loader/>
  //     </div>
  //   )
  // }
  const sortedBooks = books?.slice().sort((a:Book, b:Book) =>  {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime()
})
// The results panel has nothing to say until there's a shelf to search.
if(slot === 'results' && !books?.length) return null
if(isErrorBooks) return <FetchErrorState error={isErrorBooks} what="your books" onRetry={() => mutateBooks()}/>
// The shelf isn't in the server render, so until it arrives, its outline rather than an empty Currently reading.
if(!books) return <ShelvesSkeleton own label="Loading your shelf"/>

// Matches the Lists empty state below it. The header already has Add a book, but most new readers either
// have a shelf somewhere else (import) or don't know what to read yet (the first-book picker, Discover and,
// labelled as AI, Ask the shelf), so it offers both.
if(sortedBooks?.length === 0) return (
  <>
  <div className="flex flex-col gap-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
    <div>
      <p className="font-medium">Your shelf is empty</p>
      <p className="mt-1 text-sm text-muted-foreground">Not sure what to read? We&apos;ll suggest a few from the genres you picked and the people you follow. Or bring your whole history over from Goodreads or StoryGraph in about a minute.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link
        href="/first-book"
        className={primaryButtonClass}
        style={user?.favColour ? { background: user.favColour, color: readableInk(user.favColour) } : undefined}
      >
        <Compass size={16} aria-hidden />Help me pick a book
      </Link>
      <button type="button" onClick={() => bookEntryModal.onOpen()} className={secondaryButtonClass}>
        <Plus size={16} aria-hidden />Add a book
      </button>
      <Link href="/import" className={secondaryButtonClass}>
        <FileUp size={15} aria-hidden />Import your books
      </Link>
    </div>
    <p className="text-sm text-muted-foreground">
      Or <Link href="/discover" className="font-medium text-foreground underline-offset-4 hover:underline">browse Discover</Link>, or <Link href="/discover/ask" className="font-medium text-foreground underline-offset-4 hover:underline">ask the shelf</Link> <AiLabel className="align-[1px]" /> in your own words.
    </p>
  </div>
  </>
  )
  return <BookGrid books={sortedBooks ?? []} slot={slot}/>
}

export default BookList