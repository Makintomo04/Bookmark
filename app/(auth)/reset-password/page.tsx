import { FC, Suspense } from 'react'
import Container from '../../components/Container'
import ResetPasswordComponent from '@/app/components/signIn/ResetPasswordComponent'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
  return (
    <div className="w-full min-h-screen bg-background">
      <Container>
        <div className="w-full h-screen flex justify-center items-center">
          <div className="">

     <Suspense fallback={null}>
     <ResetPasswordComponent/>
     </Suspense>
        </div>
        </div>
        </Container>
       </div>
    )
}

export default Page
