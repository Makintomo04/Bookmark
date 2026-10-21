"use client"
import useBookEntryModal from '@/app/hooks/useBookEntryModal';
import useUser from '@/app/hooks/useUser';
import { FC } from 'react'
import Loader from '../Loader';
import { Book } from '@prisma/client';
import useBooks from '@/app/hooks/useBooks';
import { IoAddOutline } from 'react-icons/io5';
import BookGrid from './BookGrid';
import FetchErrorState from '../FetchErrorState';

interface BookListProps {
  
}

const BookList: FC<BookListProps> = ({}) => {
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
if(isErrorBooks) return <FetchErrorState error={isErrorBooks} what="your books" onRetry={() => mutateBooks()}/>
if(sortedBooks?.length === 0) return (
  <div className="flex px-4 justify-center items-center h-32 bg-slate-100/40 dark:bg-neutral-900/40 border border-dashed rounded-lg text-muted-foreground">
    <div className="flex gap-3 items-center">
  <p className='text-lg'>You have no book entries, create an entry.</p>
  <div style={{background:`${user?.favColour}`}} onClick={() => bookEntryModal.onOpen()} className="group hidden hover:-translate-y-[1px] transition h-24 w-full cursor-pointer sm:h-16 sm:w-16 md:h-10 md:w-10 bg-slate-200 hover:bg-slate-100 rounded-lg sm:rounded-full md:flex items-center justify-center sm:mt-0">
      <IoAddOutline className="text-white text-5xl sm:text-3xl"/>
    </div>
    </div>
  </div>
  )
  return <BookGrid books={sortedBooks ?? []}/>
}

export default BookList