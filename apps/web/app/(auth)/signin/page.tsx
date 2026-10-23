"use client"
import { FC } from 'react'
import Container from '../../components/Container'
import SignInComponent from '@/app/components/signIn/SignInComponent'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
    return (
      <div className="w-full min-h-dvh bg-background">
        <Container>
          <div className="w-full min-h-dvh flex justify-center items-start sm:items-center sm:py-10">
            <div className="w-full sm:w-auto">

       <SignInComponent/>
        </div>
        </div>
        </Container>
       </div>
    )

}

export default Page
