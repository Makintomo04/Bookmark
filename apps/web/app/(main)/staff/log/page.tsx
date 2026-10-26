import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffLog from '@/app/components/staff/StaffLog'
import { can } from '@/lib/roles'

const Page = async () => {
  const user = await getCurrentUser()
  if (!can(user, 'staff.log')) notFound()
  return <StaffLog />
}

export default Page
