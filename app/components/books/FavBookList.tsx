"use client"
import useBookEntryModal from '@/app/hooks/useBookEntryModal';
import useUser from '@/app/hooks/useUser';
import { FC } from 'react'
import Loader from '../Loader';
import { Book } from '@prisma/client';
import useBooks from '@/app/hooks/useBooks';
import Link from 'next/link';
import BookGrid from './BookGrid';
import FetchErrorState from '../FetchErrorState';

interface BookListProps {
  
}

const BookList: FC<BookListProps> = ({}) => {
  const {user,isLoading:isLoadingUser,isError:isErrorUser,mutate:mutateUser} = useUser();
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks,mutate:mutateBooks} = useBooks();
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
const favouritesList = user?.favouriteIds
const myFavBooks:Book[] = sortedBooks?.filter((book:Book) => favouritesList?.includes(book.id)) ?? []
if(isErrorUser || isErrorBooks) return <FetchErrorState error={isErrorUser || isErrorBooks} what="your favourites" onRetry={() => { mutateUser(); mutateBooks() }}/>
if(isLoadingUser || isLoadingBooks) return <Loader notScreen/>
if(myFavBooks?.length === 0) return (
<div className="">
<p className='text-lg'>You have no books favourited, visit <Link href="/" className='text-[#F13c3d] hover:underline transition'>Home</Link> to view your books or create an entry.</p>
</div>
)
  return <BookGrid books={myFavBooks} flat/>
}

export default BookList