
import Header from "@/app/components/Header";
import EditProfileModal from "../components/modals/EditProfileModal";

 
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  )
}