import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffNav from '@/app/components/staff/StaffNav'
import { can, isStaffRole, ROLE_LABELS, roleOf } from '@/lib/roles'

export const metadata: Metadata = {
  title: 'Staff',
  robots: { index: false },
}

// The staff console. Readers get a 404, so it isn't advertised. Each page checks its own permission
// as well, and so does every /api/staff route: this layout only decides what's shown.
const StaffLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/staff')
  if (!isStaffRole(user)) notFound()

  const tabs = [
    can(user, 'reports.review') && { href: '/staff/reports', label: 'Reports' },
    can(user, 'catalogue.edit') && { href: '/staff/catalogue', label: 'Catalogue' },
    can(user, 'users.view') && { href: '/staff/users', label: 'Readers' },
    can(user, 'staff.log') && { href: '/staff/log', label: 'Log' },
  ].filter((t): t is { href: string, label: string } => !!t)

  return (
    <div className="mt-8 sm:mt-12">
      <Container>
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="page-title">Staff</h1>
            <p className="text-sm text-muted-foreground">Signed in as {ROLE_LABELS[roleOf(user)].toLowerCase()}</p>
          </div>
          <StaffNav tabs={tabs} />
          <div className="mt-6">{children}</div>
        </div>
      </Container>
    </div>
  )
}

export default StaffLayout
