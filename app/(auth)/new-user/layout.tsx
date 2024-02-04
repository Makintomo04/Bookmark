import getCurrentUser, { getSession } from "@/app/actions/getCurrentUser";
import Header from "@/app/components/Header";

 
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const session = await getSession();
  
    console.log("USER",user,session);
 
  return (
    <>
      <main className="">{children}</main>
    </>
  )
}