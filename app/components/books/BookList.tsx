"use client"
import useBookEntryModal from '@/app/hooks/useBookEntryModal';
import useUser from '@/app/hooks/useUser';
import { FC } from 'react'
import Loader from '../Loader';
import BookCard from '../cards/BookCard';
import { Book } from '@prisma/client';
import useBooks from '@/app/hooks/useBooks';
import { IoAddOutline } from 'react-icons/io5';

interface BookListProps {
  
}

const BookList: FC<BookListProps> = ({}) => {
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks} = useBooks();
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
if(sortedBooks?.length === 0) return (
  <div className="flex px-4 justify-center items-center h-32 bg-slate-100/40 dark:bg-neutral-900/40 border border-dashed rounded-lg text-muted-foreground">
    <div className="flex gap-3 items-center">
  <p className='text-lg'>You have no book entries, create an entry.</p>
  <div style={{background:`${user?.favColour}`}} onClick={bookEntryModal.onOpen} className="group hidden hover:-translate-y-[1px] transition h-24 w-full cursor-pointer sm:h-16 sm:w-16 md:h-10 md:w-10 bg-slate-200 hover:bg-slate-100 rounded-lg sm:rounded-full md:flex items-center justify-center sm:mt-0">
      <IoAddOutline className="text-white text-5xl sm:text-3xl"/>
    </div>
    </div>
  </div>
  )
  return (
     
<div className="grid grid-cols-1 xs:grid-cols-4  sm:grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-10 lg:grid-cols-4 ">
{sortedBooks?.map((book:any) => (
  <BookCard key={book?.id} book={book}/>
))}
</div>
  )
}

export default BookList