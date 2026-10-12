"use client"
import { useSession } from "next-auth/react";
import Container from "../components/Container";
import ProfileHead from "../components/profile-head/ProfileHead";
import useUser from "../hooks/useUser";
import Loader from "../components/Loader";
import BookList from "../components/books/BookList";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  }, [user,isLoading])
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
