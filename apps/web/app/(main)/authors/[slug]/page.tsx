import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Container from '@/app/components/Container'
import AuthorBooks from '@/app/components/authors/AuthorBooks'
import AboutAuthor from '@/app/components/authors/AboutAuthor'
import FollowAuthorButton from '@/app/components/authors/FollowAuthorButton'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { authorAbout, authorBooksPage, findAuthor } from '@/lib/authors'
import { authorHref, authorSlug } from '@/lib/authorNames'
import { canFollow, isFollowingAuthor } from '@/lib/authorFollows'

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
  const author = await findAuthor(slugOf(params.slug))
  if (!author) return {}
  return {
    title: `Books by ${author.name}`,
    description: `${author.name}'s books, most read first, on Bookmark.`,
  }
}

const Page = async ({ params }: PageProps) => {
  const slug = slugOf(params.slug)
  // A hand-typed or old link ("/authors/Colleen Hoover") goes to the one canonical address.
  if (authorSlug(slug) !== slug) redirect(authorHref(slug))
  const author = await findAuthor(slug)
  if (!author) notFound()
  const [first, about, user] = await Promise.all([authorBooksPage(author), authorAbout(author), getCurrentUser()])
  const following = user ? await isFollowingAuthor(user.id, author.key) : false

  return (
    <div className="mt-6 sm:mt-8">
      <Container className="flex flex-col gap-10">
        <div>
          <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />Discover
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">Author</p>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h1 className="page-title">{author.name}</h1>
            {canFollow(author) && (
              <FollowAuthorButton slug={author.slug} name={author.name} initialFollowing={following} signedIn={!!user} />
            )}
          </div>
        </div>
        <AboutAuthor name={author.name} about={about} bookCount={first.total} />
        <AuthorBooks author={author} initial={first} />
      </Container>
    </div>
  )
}

export default Page
