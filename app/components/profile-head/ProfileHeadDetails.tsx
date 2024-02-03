"use client"
import { FC, useCallback } from 'react'
import ReadingStats from './ReadingStats'
import useBookEntryModal from '@/app/hooks/useBookEntryModal';
import useBooks from '@/app/hooks/useBooks';
import useUser from '@/app/hooks/useUser';
import { IoAddOutline } from 'react-icons/io5';
import { FaBook, FaBookmark } from 'react-icons/fa';
import useFavourite from '@/app/hooks/useFavourite';
import { Book } from '@prisma/client';
import Link from 'next/link';

interface ProfileHeadDetailsProps {
  
}

const ProfileHeadDetails: FC<ProfileHeadDetailsProps> = ({}) => {
  const {user,isLoading,isError,mutate} = useUser();
  const {favourites,hasFavourited, isLoading:isFavLoading,isError:isFavError,mutate:mutateFav} = useFavourite();
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks} = useBooks();
  console.log("3333",books);
  const completedBookCount = useCallback(
    books?.reduce((count:number, book:Book) => {
    return book.status === "COMPLETED" ? count + 1 : count;
  }, 0)
    ,[books]
  )
  
  const bookEntryModal = useBookEntryModal()
  return (
    <>
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mt-20">
    <div className="px-6 md:px-12">
      <div className="flex flex-col">
    <h1 className="text-3xl font-bold">{user?.username}</h1>
    <h1 className="text-sm text-gray-500/85 dark:text-gray-300/90 mt-1 max-w-lg">{user?.bio}</h1>
    </div>
    <div className="mt-4 flex items-center gap-3">
    <div className='flex gap-1'><FaBook color={user?.favColour} /><p className="text-xs text-slate-600 dark:text-gray-300/90"><span className="font-bold mr-1">{completedBookCount}</span>Book{completedBookCount ===1 ? "" : "s"} Read</p></div>
    <div className='flex gap-1'><FaBookmark color={user?.favColour} /><Link href="/favourites" className="text-xs text-slate-600 dark:text-gray-300/90 hover:underline transition hover:underline-offset-4"><span className="font-bold mr-1">{favourites?.length}</span>Book{favourites.length ===1 ? "" : "s"} Favourited</Link></div>
    </div>
    </div>
    <div className="flex flex-col-reverse w-full sm:w-auto gap-4 sm:gap-8 sm:flex-row items-center justify-end mt-5 px-6 md:px-12 lg:mt-0 lg:pl-0">
    <div style={{background:`${user?.favColour}`}} onClick={bookEntryModal.onOpen} className="group hover:-translate-y-1 transition h-24 w-full sm:h-16 sm:w-16 cursor-pointer md:h-12 md:w-12 bg-slate-200 hover:bg-slate-100 rounded-lg sm:rounded-full flex items-center justify-center mt-5 sm:mt-0">
      <IoAddOutline className="text-white text-5xl sm:text-3xl"/>
    </div>
    <ReadingStats />
    </div>
    </div>
    <hr className="my-12"/> 
    </>
  )
}

export default ProfileHeadDetails