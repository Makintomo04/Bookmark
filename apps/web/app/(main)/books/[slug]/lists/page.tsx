import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import ListCard from '@/app/components/discover/ListCard'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { bookPageData } from '@/lib/bookPage'
import { listsWithBook } from '@/lib/bookLists'
import { bookHref, bookKeyOfSlug, bookSlug } from '@/lib/workKey'

interface PageProps {
  params: { slug: string }
}

const slugOf = (param: string) => {
  try {
    return decodeURIComponent(param)
  } catch {
    return param
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const bookKey = bookKeyOfSlug(slugOf(params.slug))
  const data = bookKey ? await bookPageData(bookKey) : null
  if (!data) return { title: "Book not found", robots: { index: false } }
  return {
    title: `Lists with ${data.book.title}`,
    description: `Readers' lists on Bookmark with ${data.book.title} by ${data.book.author} on them.`,
    alternates: { canonical: `${bookHref(data.book)}/lists` },
  }
}

// Every reader's public list with this book on it, not just the few on the book's page, in the same
// order: editors' choices, then the most remixed (lib/bookListRules.ts).
const Page = async ({ params }: PageProps) => {
  const slug = slugOf(params.slug)
  const bookKey = bookKeyOfSlug(slug)
  if (!bookKey) notFound()
  const data = await bookPageData(bookKey)
  if (!data) notFound()
  const href = bookHref(data.book)!
  if (slug !== bookSlug(data.key, data.book.title)) redirect(`${href}/lists`)

  const lists = await listsWithBook(data.book.workKey, await getCurrentUser())

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-6">
        <div>
          <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden /><span className="truncate">{data.book.title}</span>
          </Link>
          <h1 className="page-title mt-3 break-words">Lists with {data.book.title}</h1>
          <p className="mt-2 text-muted-foreground">Made by members of the Bookmark community.</p>
        </div>
        {lists.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-muted-foreground">
            No one has put {data.book.title} on a public list yet. Add it to one of yours and it&apos;ll show here.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {lists.map((list) => <ListCard key={list.id} list={list} />)}
          </div>
        )}
      </Container>
    </div>
  )
}

export default Page
