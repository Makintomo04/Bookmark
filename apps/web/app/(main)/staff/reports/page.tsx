import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffReports from '@/app/components/staff/StaffReports'
import { can } from '@/lib/roles'

const Page = async () => {
  const user = await getCurrentUser()
  if (!can(user, 'reports.review')) notFound()
  return <StaffReports canSuspend={can(user, 'users.suspend')} />
}

export default Page
