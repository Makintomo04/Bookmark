import { Suspense } from 'react'
import Container from '../../../components/Container'
import UnsubscribeLanding from '@/app/components/settings/UnsubscribeLanding'

export const metadata = { title: 'Stop the weekly email', robots: { index: false } }

const Page = () => {
  return (
    <div className="w-full min-h-dvh bg-background">
      <Container>
        <div className="w-full min-h-dvh flex justify-center items-center py-10">
          <Suspense fallback={null}>
            <UnsubscribeLanding/>
          </Suspense>
        </div>
      </Container>
    </div>
  )
}

export default Page
