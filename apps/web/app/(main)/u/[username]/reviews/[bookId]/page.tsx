import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import moment from 'moment'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { handleOf, profileHandle } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import { bookHref } from '@/lib/workKey'
import { getReviewContext, reviewCommentsFor } from '@/lib/reviewComments'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import StarRating from '@/app/components/StarRating'
import ReviewText from '@/app/components/feed/ReviewText'
import ReaderName from '@/app/components/profile/ReaderName'
import MemberAvatar from '@/app/components/buddy-reads/MemberAvatar'
import StaffSeal from '@/app/components/profile-head/StaffSeal'
import AuthorLink from '@/app/components/AuthorLink'
import ReportReviewButton from '@/app/components/books/ReportReviewButton'
import ReviewComments from '@/app/components/reviews/ReviewComments'

interface PageProps {
  params: Promise<{ username: string; bookId: string }>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params
  const viewer = await getCurrentUser()
  const review = await getReviewContext(params.bookId, viewer?.id, handleOf(params.username))
  if (!review) return { title: "Review not found", robots: { index: false } }
  return { title: `${readerName(review.owner)}'s review of ${review.book.title}`, robots: { index: false } }
}

// One review, in full, with the comments under it. Whether the viewer may read it is decided once, in
// lib/reviewComments.ts (the same rules as the profile: review visibility, blocks, private and removed
// reviews); anything they can't read is a plain 404.
export default async function Page(props: PageProps) {
  const params = await props.params
  const viewer = await getCurrentUser()
  const handle = profileHandle(params.username, `/reviews/${params.bookId}`)
  const review = await getReviewContext(params.bookId, viewer?.id, handle)
  if (!review) notFound()

  const { book, owner, relation, shown } = review
  const isSelf = relation.isSelf
  const comments = await reviewCommentsFor(book.id, viewer?.id)
  const href = bookHref({ workKey: book.workKey, pageWorkId: book.workId, title: book.title })
  const closedReason = review.canComment ? null
    : !viewer ? "Sign in to join the conversation."
    : review.audience === "OFF" ? "Comments are off for this review."
    : "Only the reviewer's friends can comment on this review."

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container>
        <div className="max-w-2xl">
          <Link href={`/u/${encodeURIComponent(owner.username ?? '')}/reviews`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />{isSelf ? "Your reviews" : `${readerName(owner)}’s reviews`}
          </Link>

          <header className="mt-6 flex gap-5">
            <div className="w-24 shrink-0 self-start">
              {href
                ? <Link href={href} aria-hidden tabIndex={-1} className="block transition hover:opacity-90"><BookCover book={book} variant="thumb" sizes="96px" className="shadow-sm" /></Link>
                : <BookCover book={book} variant="thumb" sizes="96px" className="shadow-sm" />}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="page-title break-words">
                {href ? <Link href={href} className="hover:underline underline-offset-4">{book.title}</Link> : book.title}
              </h1>
              <p className="mt-1 text-muted-foreground"><AuthorLink author={book.author} /></p>
              {book.rating ? <StarRating value={book.rating} readOnly size={18} label="Rating" className="mt-2" /> : null}
            </div>
          </header>

          <div className="mt-6 flex items-center gap-3">
            <Link href={`/u/${encodeURIComponent(owner.username ?? '')}`} className="rounded-[30%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MemberAvatar username={owner.username} image={owner.image} favColour={owner.favColour} size={36} />
            </Link>
            <p className="min-w-0 text-sm leading-snug">
              <Link href={`/u/${encodeURIComponent(owner.username ?? '')}`} className="hover:underline underline-offset-4">
                <ReaderName reader={owner} className="font-semibold" badge={owner.staffBadge && <StaffSeal kind={owner.staffBadge} size={18} pressable={false} className="ml-1 align-[-4px]" />} />
              </Link>
              {book.completedAt && <span className="block text-xs text-muted-foreground">Finished {moment(book.completedAt).format('D MMMM YYYY')}</span>}
            </p>
          </div>

          <ReviewText
            review={shown.review}
            spoiler={shown.reviewSpoiler}
            hidden={shown.reviewHidden}
            removed={shown.reviewRemoved}
            maxChars={Infinity}
            className="mt-6 text-base leading-relaxed"
          />
          {!isSelf && viewer && <ReportReviewButton bookId={book.id} className="mt-4" />}

          <div className="mt-10 border-t pt-8">
            <ReviewComments bookId={book.id} comments={comments} canComment={review.canComment} closedReason={closedReason} isReviewer={isSelf} />
          </div>
        </div>
      </Container>
    </div>
  )
}
