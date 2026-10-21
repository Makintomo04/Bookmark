import { FC } from 'react'
import Container from '../../components/Container'
import ForgotPasswordComponent from '@/app/components/signIn/ForgotPasswordComponent'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
  return (
    <div className="w-screen h-screen bg-red-400">
      <Container>
        <div className="w-full h-screen flex justify-center items-center">
          <div className="">

     <ForgotPasswordComponent/>
        </div>
        </div>
        </Container>
       </div>
    )
}

export default Page
