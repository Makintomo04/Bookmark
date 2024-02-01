"use client"
import { useSession } from "next-auth/react";
import Image from "next/image";
import Container from "../components/Container";
import ProfileHead from "../components/profile-head/ProfileHead";
import useUser from "../hooks/useUser";
import useBooks from "../hooks/useBooks";
import ReadingStats from "../components/profile-head/ReadingStats";
import Loader from "../components/Loader";
import { FaBookmark } from "react-icons/fa6";
import { FaBook } from "react-icons/fa";
import BookCard from "../components/cards/BookCard";
import EditProfileModal from "../components/modals/EditProfileModal";
import { IoClose } from "react-icons/io5";
import BookEntryModal from "../components/modals/BookEntryModal";
import { IoAddOutline } from "react-icons/io5";
import useBookEntryModal from "../hooks/useBookEntryModal";
import { Book } from "@prisma/client";
import BookUpdateModal from "../components/modals/BookUpdateModal";



// import getCurrentUser from "../actions/getCurrentUser";

export default function  Home () {
  const {data: session, status} = useSession();
  const {user,isLoading,isError,mutate} = useUser();
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks} = useBooks();
  console.log(user);
  const bookEntryModal = useBookEntryModal()
  if (isLoading || isLoadingBooks) {
    return (
      <div className="h-screen w-screen">
        <Loader/>
      </div>
    )
  }
  const sortedBooks = books.slice().sort((a:Book, b:Book) =>  {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime()
})
  return (
    <main className="h-full bg-background">
      <Container>
        <BookUpdateModal/>
        <BookEntryModal/>
        <EditProfileModal/>
      <ProfileHead imgSrc={user?.image} bannerSrc={user?.banner} color={user?.favColour}/>
      <div className="flex flex-col  md:flex-row justify-between items-start md:items-center mt-20">
      <div className="px-6 md:px-12">
        <div className="flex flex-col">
      <h1 className="text-3xl font-bold">{user?.username}</h1>
      <h1 className="text-sm text-gray-500/85 dark:text-gray-300/90 mt-1 max-w-md">{user?.bio}</h1>
      </div>
      <div className="mt-4 flex items-center gap-3">
      <div className="flex gap-2 items-center"><FaBook color={user?.favColour} /><p className="text-xs text-slate-600 dark:text-gray-300/90"><span className="font-bold mr-1">0</span>Books Read</p></div>
      <div className="flex gap-2 items-center"><FaBookmark color={user?.favColour} /><p className="text-xs text-slate-600 dark:text-gray-300/90"><span className="font-bold mr-1">0</span>Books Favourited</p></div>
      </div>
      </div>
      <div className="flex items-center gap-0 cursor-pointer">
      <div style={{background:`${user.favColour}`}} onClick={bookEntryModal.onOpen} className="group hover:-translate-y-1 transition h-10 w-10 bg-slate-200 hover:bg-slate-100 rounded-full flex items-center justify-center">
        <IoAddOutline size={32} className="text-white"/>
      </div>
      <ReadingStats books={books}/>
      </div>
      </div>
      <hr className="my-12"/> 

      {/* /**CARDS */ }
<div className="grid grid-cols-1 xs:grid-cols-4  sm:grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-10 lg:grid-cols-4 ">
{sortedBooks.map((book:any) => (
  <BookCard key={book.id} book={book}/>
))}
</div>

      </Container>
    </main>
  );
}
