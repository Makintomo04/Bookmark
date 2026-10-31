import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffMonitoring from '@/app/components/staff/StaffMonitoring'
import { can } from '@/lib/roles'

// Not in the staff tabs: only used to check error monitoring after a deploy (docs/ops/error-monitoring.md).
const Page = async () => {
  const user = await getCurrentUser()
  if (!can(user, 'staff.log')) notFound()
  return <StaffMonitoring />
}

export default Page
