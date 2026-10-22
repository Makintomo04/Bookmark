import { FC } from 'react'
import Container from '../../components/Container'
import SignUpComponent from '@/app/components/register/SignUpComponent'
import Image from 'next/image'

interface pageProps {
  
}

const Page: FC<pageProps> = ({}) => {
  return (
    <div className="w-full min-h-screen bg-background">
      <Container>
        <div className="w-full h-screen flex justify-center items-center">
          <div className="">
          
     <SignUpComponent/>
      </div>
      </div>
      </Container>
     </div>
  )
}

export default Page