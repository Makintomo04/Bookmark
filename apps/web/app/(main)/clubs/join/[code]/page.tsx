import { Metadata } from 'next'
import Link from 'next/link'
import moment from 'moment'
import { notFound, redirect } from 'next/navigation'
import { readerName } from '@/lib/profile'
import { cn } from '@/lib/utils'
import prisma from '@/lib/db'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { CLUB_REMOVED_MESSAGE, loadClubInvite, wasRemovedFromClub } from '@/lib/clubsServer'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import MemberAvatar from '@/app/components/buddy-reads/MemberAvatar'
import ClubJoinButton from '@/app/components/clubs/ClubJoinButton'
import StaffSeal from '@/app/components/profile-head/StaffSeal'
import { primaryButtonClass, secondaryButtonClass } from '@/app/components/profile-head/ProfileHeader'

interface PageProps {
  params: Promise<{ code: string }>
}

// The club's one invite link. Anyone can open it, signed in or not: the club, its host and who's in, and the
// covers of what it's reading and what's next. Nothing from inside a circle (no progress, no comments).
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const invite = await loadClubInvite(params.code)
  if (!invite) return { title: "Club", robots: { index: false } }
  const { club, host, current } = invite
  const hostName = host ? readerName(host) : null
  const title = `Join ${club.name} on Bookmark`
  const description = `${hostName || "A reader"} invited you to ${club.name}${current ? `, reading ${current.title} by ${current.author}` : ""}. Join once and you're in for every book: track progress together, with comments that stay hidden until you reach them.`
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  }
}

type InviteBook = { title: string, author: string, coverImage: string | null, cardColour: string | null, startsAt: string }

const BookLine = ({ label, book }: { label: string, book: InviteBook }) => (
  <div className="flex items-center gap-3 text-left">
    <BookCover book={{ title: book.title, author: book.author, coverImage: book.coverImage ?? "", cardColour: book.cardColour }} variant="thumb" sizes="48px" className="w-12 shrink-0 shadow-sm" />
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium leading-snug line-clamp-2">{book.title}</p>
      <p className="text-sm text-muted-foreground truncate" suppressHydrationWarning>{book.author} · from {moment(book.startsAt).format("D MMMM")}</p>
    </div>
  </div>
)

const Page = async (props: PageProps) => {
  const params = await props.params;
  const viewer = await getCurrentUser()
  const invite = await loadClubInvite(params.code, viewer?.id)
  if (!invite) notFound()
  const { club, host, members, memberCount, current, next, booksRead, full } = invite

  if (viewer) {
    const isMember = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: viewer.id } }, select: { id: true } })
    if (isMember) redirect(`/clubs/${club.id}`)
  }
  const removed = viewer ? await wasRemovedFromClub(club.id, viewer.id) : false
  // Back here after signing up or in, where joining is one tap.
  const back = encodeURIComponent(`/clubs/join/${params.code}`)
  const others = memberCount - 1

  return (
    <div className="mt-10 sm:mt-16">
      <Container className="max-w-2xl">
        <div className="flex flex-col items-center text-center gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Book club</p>
            <h1 className="page-title">{club.name}</h1>
            {club.about && <p className="max-w-md text-muted-foreground whitespace-pre-line">{club.about}</p>}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex -space-x-2">
              {members.slice(0, 8).map((m) => (
                <MemberAvatar key={m.userId} username={m.username} image={m.image} favColour={m.favColour} size={40} className="ring-2 ring-background" />
              ))}
            </div>
            <p className="max-w-md">
              <span className="font-semibold">{(host && readerName(host)) || "A reader"}</span>
              {host?.staffBadge && <StaffSeal kind={host.staffBadge} name={readerName(host)} size={18} className="ml-1 align-[-4px]" />}
              {" "}invited you to join the club{others > 0 ? `, with ${others} ${others === 1 ? "other reader" : "other readers"}` : ""}.
              {booksRead > 0 ? ` They've read ${booksRead} ${booksRead === 1 ? "book" : "books"} together so far.` : ""}
            </p>
          </div>

          {(current || next) && (
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
              {current && <BookLine label="Reading now" book={current} />}
              {next && <BookLine label="Up next" book={next} />}
            </div>
          )}

          <p className="max-w-md text-sm text-muted-foreground">
            Join once and you&apos;re added to every book the club reads, in any edition or on audio. Comments are pinned to where they were written and stay locked until you get there.
          </p>

          {removed ? (
            <p className="max-w-md text-muted-foreground">{CLUB_REMOVED_MESSAGE}</p>
          ) : full ? (
            <p className="text-muted-foreground">This club is full.</p>
          ) : viewer ? (
            <div className="flex flex-col items-center gap-2">
              <ClubJoinButton code={params.code} />
              {current && <p className="text-xs text-muted-foreground">Not on your shelf yet? It&apos;ll be added to Want to read until you start.</p>}
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={`/register?callbackUrl=${back}`} className={cn(primaryButtonClass, "pointer-fine:h-11 px-6 text-base")}>Create an account to join</Link>
              <Link href={`/signin?callbackUrl=${back}`} className={cn(secondaryButtonClass, "pointer-fine:h-11 px-6 text-base")}>Sign in</Link>
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}

export default Page
