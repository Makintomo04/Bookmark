"use client"
import { useSession } from "next-auth/react";
import useUser from "../hooks/useUser";
import Loader from "../components/Loader";
import Landing from "../components/landing/Landing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function  Home () {
  const router = useRouter()
  const {status} = useSession()
  const {user,isLoading} = useUser();
  const [isPageLoading, setIsPageLoading] = useState(true)
  useEffect(() => {
    if(status === "unauthenticated"){
      setIsPageLoading(false)
      return
    }
    if(status !== "authenticated") return
    if(isLoading) return
    if(user){
      if(!user?.favColour) {
        router.push("/new-user")
      }
      else{
        router.push(`/u/${encodeURIComponent(user.username)}`)
      }
    }
    else{
      // Session token is valid but no matching user exists anymore
      // (e.g. the account was deleted) - treat the same as logged out.
      setIsPageLoading(false)
    }
  }, [user,isLoading,status])

  if(status === "unauthenticated"){
    return <Landing/>
  }

  if(isPageLoading){
    return (
      <div className="w-full h-full">

          <Loader/>

      </div>
    )
  }

  return <Landing/>
}
