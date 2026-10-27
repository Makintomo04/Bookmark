import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffUsers from '@/app/components/staff/StaffUsers'
import { can } from '@/lib/roles'

const Page = async ({ searchParams }: { searchParams: { q?: string } }) => {
  const user = await getCurrentUser()
  if (!user || !can(user, 'users.view')) notFound()
  return (
    <StaffUsers
      viewerId={user.id}
      initialQuery={searchParams.q ?? ''}
      canSuspend={can(user, 'users.suspend')}
      canGrant={can(user, 'plus.grant')}
      canAssign={can(user, 'roles.assign')}
    />
  )
}

export default Page
