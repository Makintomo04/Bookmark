
import Header from "@/app/components/Header";
import EditProfileModal from "../components/modals/EditProfileModal";
import getCurrentUser from "../actions/getCurrentUser";
import { useSession } from "next-auth/react";
import { Metadata } from "next";
import BookUpdateModal from "../components/modals/BookUpdateModal";
import BookEntryModal from "../components/modals/BookEntryModal";
import Footer from "../components/footer/Footer";

export const metadata: Metadata = {
  title: "Home",
}
 
export default function Layout({ children }: { children: React.ReactNode }) {
  // if (!sesssion) {
  //   return (
  //     <>
  //       <Header />
  //       <main className="hidden">{children}</main>
  //     </>
  //   )
  // }
  
  return (
    <div className="relative h-full">
        <BookUpdateModal/>
        <BookEntryModal/>
        <EditProfileModal/>
        <div className="flex flex-col h-screen">
      <Header />
      <main className="flex-grow h-auto">{children}</main>
      <hr/>
      <Footer/>
        </div>
    </div>
  )
}