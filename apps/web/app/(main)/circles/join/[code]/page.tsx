import { Metadata } from 'next'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import MemberAvatar from '@/app/components/buddy-reads/MemberAvatar'
import JoinButton from '@/app/components/buddy-reads/JoinButton'
import { primaryButtonClass, secondaryButtonClass } from '@/app/components/profile-head/ProfileHeader'
import { cn } from '@/lib/utils'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { BUDDY_READ_MAX_MEMBERS } from '@/lib/buddyReads'
import { REMOVED_MESSAGE, loadInvite, wasRemoved } from '@/lib/buddyReadsServer'
import prisma from '@/lib/db'
import AuthorLink from '@/app/components/AuthorLink'
import StaffSeal from '@/app/components/profile-head/StaffSeal'

interface PageProps {
  params: Promise<{ code: string }>
}

// The invite link is the acquisition loop, so it unfurls nicely: book, host, and who's in (see opengraph-image).
// Nothing past the cover is shown here: no progress and no comments.
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const invite = await loadInvite(params.code)
  if (!invite) return { title: "Reading circle", robots: { index: false } }
  const { buddyRead, host, memberCount } = invite
  const hostName = host ? readerName(host) : null
  const title = `Read ${buddyRead.title} with ${hostName || "friends"}`
  const others = memberCount - 1
  const description = `${hostName || "A reader"} is reading ${buddyRead.title} by ${buddyRead.author}${others > 0 ? ` with ${others} ${others === 1 ? "other" : "others"}` : ""}. Join the reading circle on Bookmark: track progress together, with comments that stay hidden until you reach them.`
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

const Page = async (props: PageProps) => {
  const params = await props.params;
  const viewer = await getCurrentUser()
  const invite = await loadInvite(params.code, viewer?.id)
  if (!invite) notFound()
  const { buddyRead, host, members, memberCount } = invite

  if (viewer) {
    const isMember = await prisma.buddyReadMember.findUnique({
      where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: viewer.id } },
      select: { id: true },
    })
    if (isMember) redirect(`/circles/${buddyRead.id}`)
  }
  // A club's book is joined through the club, which brings this book and every one after.
  if (buddyRead.clubId) {
    const club = await prisma.club.findUnique({ where: { id: buddyRead.clubId }, select: { inviteCode: true, status: true } })
    if (club?.status === "ACTIVE") redirect(`/clubs/join/${club.inviteCode}`)
  }
  const removed = viewer ? await wasRemoved(buddyRead.id, viewer.id) : false
  const full = memberCount >= BUDDY_READ_MAX_MEMBERS

  return (
    <div className="mt-10 sm:mt-16">
      <Container className="max-w-2xl">
        <div className="flex flex-col items-center text-center gap-6">
          <BookCover
            book={{ title: buddyRead.title, author: buddyRead.author, coverImage: buddyRead.coverImage ?? "", cardColour: buddyRead.cardColour }}
            sizes="160px"
            className="w-36 sm:w-40 shadow-lg"
          />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reading circle</p>
            <h1 className="page-title">{buddyRead.title}</h1>
            <p className="text-muted-foreground"><AuthorLink author={buddyRead.author} /></p>
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
              {" "}invited you to read along
              {memberCount > 1 ? ` with ${memberCount - 1} ${memberCount - 1 === 1 ? "other" : "others"}` : ""}.
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Everyone&apos;s progress in one place, in any edition or on audio. Comments are pinned to where they were written and stay locked until you get there.
            </p>
          </div>

          {removed ? (
            <p className="max-w-md text-muted-foreground">{REMOVED_MESSAGE}</p>
          ) : full ? (
            <p className="text-muted-foreground">This reading circle is full.</p>
          ) : viewer ? (
            <div className="flex flex-col items-center gap-2">
              <JoinButton code={params.code} />
              <p className="text-xs text-muted-foreground">Not on your shelf yet? It&apos;ll be added to Currently reading.</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={`/register?callbackUrl=${encodeURIComponent(`/circles/join/${params.code}`)}`} className={cn(primaryButtonClass, "pointer-fine:h-11 px-6 text-base")}>Create an account to join</Link>
              <Link href={`/signin?callbackUrl=${encodeURIComponent(`/circles/join/${params.code}`)}`} className={cn(secondaryButtonClass, "pointer-fine:h-11 px-6 text-base")}>Sign in</Link>
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}

export default Page
