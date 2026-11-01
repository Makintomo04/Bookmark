import { headers } from 'next/headers'
import { ExternalLink } from 'lucide-react'
import { buyLinks } from '@bookmark/shared/affiliate'
import { buyIsbnForWork } from '@/lib/buyIsbn'

// "Get a copy" on a book page: plain links to the shops (packages/shared/src/affiliate.ts), shown to every
// reader, Plus or not, since they're useful rather than an ad. rel="sponsored" when a link carries our tag.
const BuyLinks = async ({ book, workId, headingClassName }: { book: { title: string; author?: string | null }; workId: string | null; headingClassName?: string }) => {
  const [country, isbn13] = await Promise.all([
    headers().then((h) => h.get('x-vercel-ip-country')),
    buyIsbnForWork(workId),
  ])
  const links = buyLinks({ ...book, isbn13 }, country, {
    bookshopUs: process.env.BOOKSHOP_AFFILIATE_ID,
    bookshopUk: process.env.BOOKSHOP_UK_AFFILIATE_ID,
    amazonUs: process.env.AMAZON_ASSOCIATE_TAG,
    amazonUk: process.env.AMAZON_UK_ASSOCIATE_TAG,
  })
  if (links.length === 0) return null
  const earns = links.some((link) => link.affiliate)

  return (
    <section aria-labelledby="buy-heading" className="flex flex-col gap-3">
      <h2 id="buy-heading" className={headingClassName}>Get a copy</h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.store}>
            <a
              href={link.href}
              target="_blank"
              rel={link.affiliate ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
              <ExternalLink size={14} aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      {earns && <p className="text-xs text-muted-foreground">Bookmark may earn a small commission if you buy through these links. It never changes what we show you.</p>}
    </section>
  )
}

export default BuyLinks
