import { FC } from 'react'
import Container from '../../components/Container'
import SignUpComponent from '@/app/components/register/SignUpComponent'
import Image from 'next/image'

interface pageProps {
  
}

const Page: FC<pageProps> = ({}) => {
  return (
    <div className="w-full min-h-dvh bg-background">
      <Container>
        <div className="w-full min-h-dvh flex justify-center items-start sm:items-center sm:py-10">
          <div className="w-full sm:w-auto">
          
     <SignUpComponent/>
      </div>
      </div>
      </Container>
     </div>
  )
}

export default Page