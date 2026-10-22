import { Suspense } from 'react'
import Container from '../../../components/Container'
import MagicLinkLanding from '@/app/components/signIn/MagicLinkLanding'

const Page = () => {
  return (
    <div className="w-full min-h-dvh bg-background">
      <Container>
        <div className="w-full min-h-dvh flex justify-center items-start sm:items-center sm:py-10">
          <Suspense fallback={null}>
            <MagicLinkLanding/>
          </Suspense>
        </div>
      </Container>
    </div>
  )
}

export default Page
