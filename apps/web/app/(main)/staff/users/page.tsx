import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffUsers from '@/app/components/staff/StaffUsers'
import { can } from '@/lib/roles'

const Page = async (props: { searchParams: Promise<{ q?: string, appeals?: string }> }) => {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser()
  if (!user || !can(user, 'users.view')) notFound()
  return (
    <StaffUsers
      viewerId={user.id}
      initialQuery={searchParams.q ?? ''}
      // The Overview's "Appeals waiting" tile links here with ?appeals=open. Admins only; the API checks too.
      initialAppeals={searchParams.appeals === 'open' && can(user, 'users.suspend')}
      canSuspend={can(user, 'users.suspend')}
      canGrant={can(user, 'plus.grant')}
      canAssign={can(user, 'roles.assign')}
      // A reader's history is the full log; librarians (log.own) see only their own actions and books.
      canViewLog={can(user, 'staff.log')}
    />
  )
}

export default Page
