import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import CatalogueSections from '@/app/components/staff/CatalogueSections'
import StaffAuthors from '@/app/components/staff/StaffAuthors'
import { can } from '@/lib/roles'

// "Edit author" on an author page searches for its name (?q=), so other spellings show alongside it.
const Page = async (props: { searchParams: Promise<{ name?: string, q?: string }> }) => {
  const searchParams = await props.searchParams
  const user = await getCurrentUser()
  if (!can(user, 'catalogue.edit')) notFound()
  return (
    <div className="flex flex-col gap-4">
      <CatalogueSections />
      <StaffAuthors initialName={searchParams.name ?? null} initialQuery={searchParams.q ?? searchParams.name ?? ''} />
    </div>
  )
}

export default Page
