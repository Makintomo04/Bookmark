import { notFound } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import StaffCatalogue from '@/app/components/staff/StaffCatalogue'
import prisma from '@/lib/db'
import { can } from '@/lib/roles'
import { workKeyOfQuery } from '@/lib/workKey'
import { survivorOf } from '@/lib/catalogueMerge'

const Page = async (props: { searchParams: Promise<{ work?: string, q?: string }> }) => {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser()
  if (!can(user, 'catalogue.edit')) notFound()
  // "Fix this book" on a book page sends its Open Library key when it has no catalogue id to hand. A book
  // already in the catalogue opens straight in the editor; one that isn't gets "Add from Open Library".
  // A duplicate merged into another book opens the book it went into.
  const olKey = !searchParams.work && searchParams.q ? workKeyOfQuery(searchParams.q) : null
  const found = olKey ? await prisma.work.findFirst({ where: { openLibraryKey: olKey }, select: { id: true } }) : null
  const opened = found ? (await survivorOf(found.id))?.id ?? found.id : null
  return <StaffCatalogue initialWorkId={searchParams.work ?? opened} initialQuery={found ? '' : searchParams.q ?? ''} />
}

export default Page
