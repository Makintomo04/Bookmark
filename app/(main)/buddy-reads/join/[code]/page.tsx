import { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import MemberAvatar from '@/app/components/buddy-reads/MemberAvatar'
import JoinButton from '@/app/components/buddy-reads/JoinButton'
import { primaryButtonClass, secondaryButtonClass } from '@/app/components/profile-head/ProfileHeader'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { BUDDY_READ_MAX_MEMBERS } from '@/lib/buddyReads'
import { loadInvite } from '@/lib/buddyReadsServer'
import prisma from '@/lib/db'

interface PageProps {
  params: { code: string }
}

// The invite link is the acquisition loop, so it unfurls nicely: book, host, and who's in (see opengraph-image).
// Nothing past the cover is shown here: no progress and no comments.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const invite = await loadInvite(params.code)
  if (!invite) return { title: "Buddy read", robots: { index: false } }
  const { buddyRead, host, members } = invite
  const title = `Read ${buddyRead.title} with ${host?.username ?? "friends"}`
  const others = members.length - 1
  const description = `${host?.username ?? "A reader"} is reading ${buddyRead.title} by ${buddyRead.author}${others > 0 ? ` with ${others} ${others === 1 ? "other" : "others"}` : ""}. Join the buddy read on Bookmark: track progress together, with comments that stay hidden until you reach them.`
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  }
}

const Page = async ({ params }: PageProps) => {
  const [viewer, invite] = await Promise.all([getCurrentUser(), loadInvite(params.code)])
  if (!invite) notFound()
  const { buddyRead, host, members } = invite

  if (viewer) {
    const isMember = await prisma.buddyReadMember.findUnique({
      where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId: viewer.id } },
      select: { id: true },
    })
    if (isMember) redirect(`/buddy-reads/${buddyRead.id}`)
  }
  const full = members.length >= BUDDY_READ_MAX_MEMBERS

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
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buddy read</p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{buddyRead.title}</h1>
            <p className="text-muted-foreground">{buddyRead.author}</p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex -space-x-2">
              {members.slice(0, 8).map((m) => (
                <MemberAvatar key={m.userId} username={m.username} image={m.image} favColour={m.favColour} size={40} className="ring-2 ring-background" />
              ))}
            </div>
            <p className="max-w-md">
              <span className="font-semibold">{host?.username ?? "A reader"}</span> invited you to read along
              {members.length > 1 ? ` with ${members.length - 1} ${members.length - 1 === 1 ? "other" : "others"}` : ""}.
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Everyone&apos;s progress in one place, in any edition. Comments are pinned to where they were written and stay hidden until you get there.
            </p>
          </div>

          {full ? (
            <p className="text-muted-foreground">This buddy read is full.</p>
          ) : viewer ? (
            <div className="flex flex-col items-center gap-2">
              <JoinButton code={params.code} />
              <p className="text-xs text-muted-foreground">Not on your shelf yet? It&apos;ll be added to Currently reading.</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={`/register?callbackUrl=${encodeURIComponent(`/buddy-reads/join/${params.code}`)}`} className={`${primaryButtonClass} h-11 px-6 text-base`}>Create an account to join</Link>
              <Link href={`/signin?callbackUrl=${encodeURIComponent(`/buddy-reads/join/${params.code}`)}`} className={`${secondaryButtonClass} h-11 px-6 text-base`}>Sign in</Link>
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}

export default Page
