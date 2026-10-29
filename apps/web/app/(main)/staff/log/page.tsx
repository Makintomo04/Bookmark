import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffLog from '@/app/components/staff/StaffLog'
import { can } from '@/lib/roles'
import { STAFF_ACTION_LABELS } from '@/lib/staffLog'

const Page = async () => {
  const user = await getCurrentUser()
  const everything = can(user, 'staff.log')
  if (!everything && !can(user, 'log.own')) notFound()
  // A librarian's filter offers only what a librarian can do: no account actions. list.delete is no
  // longer written (only owners delete their lists), so it isn't offered to anyone.
  const actions = Object.entries(STAFF_ACTION_LABELS)
    .filter(([value]) => value !== 'list.delete' && (everything || !/^(user|plus|role)\./.test(value)))
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return <StaffLog everything={everything} actions={actions} />
}

export default Page
