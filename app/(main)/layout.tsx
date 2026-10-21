
import Header from "@/app/components/Header";
import EditProfileModal from "../components/modals/EditProfileModal";
import getCurrentUser from "../actions/getCurrentUser";
import { getSession, useSession } from "next-auth/react";
import { Metadata } from "next";
import BookUpdateModal from "../components/modals/BookUpdateModal";
import BookEntryModal from "../components/modals/BookEntryModal";
import BookEditModal from "../components/modals/BookEditModal";
import BookNotesModal from "../components/modals/BookNotesModal";
import ListEditorModal from "../components/modals/ListEditorModal";
import BookDetailsModal from "../components/modals/BookDetailsModal";
import TierPreviewBadge from "../components/dev/TierPreviewBadge";
import Footer from "../components/footer/Footer";
import { useRouter } from "next/navigation";

export const metadata: Metadata = {
  title: "Home",
}
export default async function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full">
        <BookUpdateModal/>
        <BookEntryModal/>
        <BookEditModal/>
        <BookNotesModal/>
        <EditProfileModal/>
        <ListEditorModal/>
        <BookDetailsModal/>
        <TierPreviewBadge/>
        <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pb-16">{children}</main>
      <hr/>
      <Footer/>
        </div>
    </div>
  )
}