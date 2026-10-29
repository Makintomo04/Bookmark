import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import CatalogueSections from '@/app/components/staff/CatalogueSections'
import StaffSeries from '@/app/components/staff/StaffSeries'
import { can } from '@/lib/roles'

// "Edit series" on a series page opens straight on that spelling (?name=).
const Page = async (props: { searchParams: Promise<{ name?: string, q?: string }> }) => {
  const searchParams = await props.searchParams
  const user = await getCurrentUser()
  if (!can(user, 'catalogue.edit')) notFound()
  return (
    <div className="flex flex-col gap-4">
      <CatalogueSections />
      <StaffSeries initialName={searchParams.name ?? null} initialQuery={searchParams.q ?? ''} />
    </div>
  )
}

export default Page
