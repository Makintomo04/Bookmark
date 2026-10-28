import { redirect } from 'next/navigation'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { parseShelfParams, shelfPageHref, shelfParams } from '@/lib/shelfFilter'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// A stable link to "your shelf, filtered": /stats and Ask the shelf link here without knowing the
// reader's username. Only the shelf's own params carry over (lib/shelfFilter.ts).
export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  const filter = parseShelfParams({ get: (name) => {
    const v = searchParams[name]
    return typeof v === 'string' ? v : null
  } })
  const query = shelfParams(filter).toString()
  const user = await getCurrentUser()
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(`/shelf${query ? `?${query}` : ''}`)}`)
  if (!user.username) redirect('/')
  // One shelf goes to that shelf's page; otherwise the profile, where a search spans every shelf.
  if (filter.shelf) redirect(shelfPageHref(user.username, filter.shelf, filter))
  redirect(`/u/${encodeURIComponent(user.username)}${query ? `?${query}` : ''}`)
}
