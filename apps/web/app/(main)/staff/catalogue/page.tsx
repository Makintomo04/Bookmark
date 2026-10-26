import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffCatalogue from '@/app/components/staff/StaffCatalogue'
import { can } from '@/lib/roles'

const Page = async ({ searchParams }: { searchParams: { work?: string, q?: string } }) => {
  const user = await getCurrentUser()
  if (!can(user, 'catalogue.edit')) notFound()
  return <StaffCatalogue initialWorkId={searchParams.work ?? null} initialQuery={searchParams.q ?? ''} />
}

export default Page
