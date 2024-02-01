import Header from "@/app/components/Header";

 
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="">{children}</main>
    </>
  )
}