import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffRatings from '@/app/components/staff/StaffRatings'
import { can } from '@/lib/roles'

const Page = async () => {
  const user = await getCurrentUser()
  if (!can(user, 'reports.review')) notFound()
  return <StaffRatings />
}

export default Page
