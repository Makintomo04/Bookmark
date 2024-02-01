
"use client"
import Header from "@/app/components/Header";
import EditProfileModal from "../components/modals/EditProfileModal";
import getCurrentUser from "../actions/getCurrentUser";
import { useSession } from "next-auth/react";

 
export default function Layout({ children }: { children: React.ReactNode }) {
  const {status} = useSession();
  // if (!sesssion) {
  //   return (
  //     <>
  //       <Header />
  //       <main className="hidden">{children}</main>
  //     </>
  //   )
  // }
  return (
    <>
      <Header />
      <main className="pb-24">{children}</main>
    </>
  )
}