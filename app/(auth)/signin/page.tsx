"use client"
import { FC,use,useEffect } from 'react'
import Container from '../../components/Container'
import SignInComponent from '@/app/components/signIn/SignInComponent'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Loader from '@/app/components/Loader'

interface pageProps {
  
}

const Page: FC<pageProps> = ({}) => {
  const router = useRouter()
  const {data:session,status} = useSession()

  // useEffect(() => {
  //   if(session)
  //   {
  //     router.replace("/")
  //   }
  //   return () => {
      
  //   }
  // }, [status])
  // console.log(session,status);
  // if(status === "loading"){
  //   return (
  //     <div className="w-full h-screen">

  //         <Loader/>
       
  //     </div>
  //   )
  // }
  // if(!session)
    return (
      <div className="w-screen h-screen bg-red-400">
        <Container>
          <div className="w-full h-screen flex justify-center items-center">
            <div className="">
            
       <SignInComponent/>
        </div>
        </div>
        </Container>
       </div>
    )
    
}

export default Page