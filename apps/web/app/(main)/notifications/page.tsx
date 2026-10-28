import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import NotificationsList from '@/app/components/notifications/NotificationsList'

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false },
}

// Every notification, where the bell's menu ends with "See all notifications".
export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/notifications')

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>
        <div className="mx-auto max-w-2xl px-4 sm:px-8">
          <h1 className="page-title mb-6">Notifications</h1>
          <NotificationsList />
        </div>
      </Container>
    </div>
  )
}
