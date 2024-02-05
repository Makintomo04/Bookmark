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
import BookList from "../components/books/BookList";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";


// import getCurrentUser from "../actions/getCurrentUser";

export default function  Home () {
  const router = useRouter()
  const {data:session,status} = useSession()
  const {user,isLoading} = useUser();
  const [isPageLoading, setIsPageLoading] = useState(true)
  useEffect(() => {
    if(user){
      if(!user?.favColour) {
        router.push("/new-user")
      }
      else{
        setIsPageLoading(false)
      }
    }
    console.log(user,isLoading,"£££££");
  }, [user,isLoading])
  console.log(session,status);
  if(isPageLoading){
    return (
      <div className="w-full h-full">

          <Loader/>
       
      </div>
    )
  }
  if(session)
  return (
    <main className="pb-24 h-auto flex-grow min-h-[calc(100vh_-_180px)] bg-background">
      <Container>
        {/* <Link href="/about">About</Link> */}
        <Suspense fallback={<p>Loading...</p>}>
      <ProfileHead/>
      </Suspense>
     

        <Suspense fallback={<p>Loading...</p>}>
      <BookList/>
      </Suspense>

      </Container>
    </main>
  );
}
