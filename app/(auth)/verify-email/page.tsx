import { Suspense } from 'react'
import Container from '../../components/Container'
import VerifyEmailComponent from '@/app/components/signIn/VerifyEmailComponent'

const Page = () => {
  return (
    <div className="w-screen h-screen bg-red-400">
      <Container>
        <div className="w-full h-screen flex justify-center items-center">
          <Suspense fallback={null}>
            <VerifyEmailComponent/>
          </Suspense>
        </div>
      </Container>
    </div>
  )
}

export default Page
