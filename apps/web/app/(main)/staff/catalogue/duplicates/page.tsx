import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import CatalogueSections from '@/app/components/staff/CatalogueSections'
import StaffDuplicates from '@/app/components/staff/StaffDuplicates'
import { can } from '@/lib/roles'

const Page = async () => {
  const user = await getCurrentUser()
  if (!can(user, 'catalogue.edit')) notFound()
  return (
    <div className="flex flex-col gap-4">
      <CatalogueSections />
      <StaffDuplicates />
    </div>
  )
}

export default Page
