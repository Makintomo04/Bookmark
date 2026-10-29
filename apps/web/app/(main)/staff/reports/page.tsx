import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffReports from '@/app/components/staff/StaffReports'
import { can } from '@/lib/roles'
import { isReportView } from '@/lib/staffReportRules'

// ?view=escalated or closed opens that tab (the overview links here).
const Page = async (props: { searchParams: Promise<{ view?: string }> }) => {
  const user = await getCurrentUser()
  if (!can(user, 'reports.review')) notFound()
  const { view } = await props.searchParams
  return <StaffReports canSuspend={can(user, 'users.suspend')} initialView={isReportView(view) ? view : 'open'} />
}

export default Page
