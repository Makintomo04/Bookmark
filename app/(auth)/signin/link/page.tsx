import { Suspense } from 'react'
import Container from '../../../components/Container'
import MagicLinkLanding from '@/app/components/signIn/MagicLinkLanding'

const Page = () => {
  return (
    <div className="w-full min-h-screen bg-background">
      <Container>
        <div className="w-full h-screen flex justify-center items-center">
          <Suspense fallback={null}>
            <MagicLinkLanding/>
          </Suspense>
        </div>
      </Container>
    </div>
  )
}

export default Page
