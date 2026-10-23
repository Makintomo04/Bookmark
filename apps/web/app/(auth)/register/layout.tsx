import Header from "@/app/components/Header";

 
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* <Header /> */}
      <main>{children}</main>
    </>
  )
}