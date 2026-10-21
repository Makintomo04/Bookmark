import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import AchievementsView from './AchievementsView'

export const metadata: Metadata = {
  title: "Achievements",
}

const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin')

  return (
    <div className="mt-8 sm:mt-12">
      <Container>
        <h1 className="text-3xl sm:text-4xl font-bold mb-8">Achievements</h1>
        <AchievementsView />
      </Container>
    </div>
  )
}

export default Page
