import { FC, Suspense } from 'react'
import Container from '../../components/Container'
import ResetPasswordComponent from '@/app/components/signIn/ResetPasswordComponent'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
  return (
    <div className="w-full min-h-dvh bg-background">
      <Container>
        <div className="w-full min-h-dvh flex justify-center items-start sm:items-center sm:py-10">
          <div className="w-full sm:w-auto">

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
