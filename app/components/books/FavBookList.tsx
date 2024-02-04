"use client"
import useBookEntryModal from '@/app/hooks/useBookEntryModal';
import useUser from '@/app/hooks/useUser';
import { FC } from 'react'
import Loader from '../Loader';
import BookCard from '../cards/BookCard';
import { Book } from '@prisma/client';
import useBooks from '@/app/hooks/useBooks';
import Link from 'next/link';

interface BookListProps {
  
}

const BookList: FC<BookListProps> = ({}) => {
  const {user,isLoading:isLoadingUser,isError:isErrorUser} = useUser();
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks} = useBooks();
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
const myFavBooks:Book[] = []
const favBooks:Book[] = books?.forEach((book:Book) => {
  favouritesList?.includes(book.id) && myFavBooks.push(book)
});
console.log(myFavBooks);
if(myFavBooks?.length === 0) return (
<div className="">
<p className='text-lg'>You have no books favourited, visit <Link href="/" className='text-[#F13c3d] hover:underline transition'>Home</Link> to view your books or create an entry.</p>
</div>
)
  return (
     
<div className="grid grid-cols-1 xs:grid-cols-4  sm:grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-10 lg:grid-cols-4 ">
{myFavBooks?.map((book:any) => (
  <BookCard key={book?.id} book={book}/>
))}
</div>
  )
}

export default BookList