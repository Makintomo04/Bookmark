import { FC } from 'react'
import Container from '../../components/Container'
import SignInComponent from '@/app/components/signIn/SignInComponent'
import Image from 'next/image'

interface pageProps {
  
}

const page: FC<pageProps> = ({}) => {
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

export default page