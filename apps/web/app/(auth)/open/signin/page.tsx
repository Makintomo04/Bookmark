import { Suspense } from 'react'
import { Metadata } from 'next'
import Container from '../../../components/Container'
import OpenInApp from '@/app/components/signIn/OpenInApp'

export const metadata: Metadata = { title: 'Sign in to the Bookmark app', robots: { index: false } }

// Where the app's emailed sign-in link lands when the phone doesn't open the app straight away
// (lib/mobileMagicLink.ts). It never spends the token itself.
const Page = () => {
  return (
    <div className="w-full min-h-dvh bg-background">
      <Container>
        <div className="w-full min-h-dvh flex justify-center items-start sm:items-center sm:py-10">
          <Suspense fallback={null}>
            <OpenInApp/>
          </Suspense>
        </div>
      </Container>
    </div>
  )
}

export default Page
