import { getWrapped, getWrappedOwner, isWrappedPublic, parseWrappedYear } from '@/lib/stats'
import { handleOf } from '@/lib/handle'
import { OG_SIZE, wrappedOgImage } from '@/app/components/wrapped/wrappedImage'

// What a shared Wrapped link unfurls to.
export const alt = 'A Bookmark Wrapped year in books'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: { username: string; year: string } }) {
  const year = parseWrappedYear(params.year)
  const owner = year ? await getWrappedOwner(handleOf(params.username)) : null
  // Crawlers have no session, so only a public Wrapped gets an image.
  if (!year || !owner || !(await isWrappedPublic(owner))) return new Response('Not found', { status: 404 })

  const wrapped = await getWrapped(owner.id, year, null, { sharedOnly: true })
  return wrappedOgImage({ wrapped, username: owner.username, displayName: owner.displayName, favColour: owner.favColour })
}
