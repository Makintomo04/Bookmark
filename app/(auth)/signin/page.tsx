"use client"
import { FC } from 'react'
import Container from '../../components/Container'
import SignInComponent from '@/app/components/signIn/SignInComponent'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
    return (
      <div className="w-full min-h-screen bg-background">
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
