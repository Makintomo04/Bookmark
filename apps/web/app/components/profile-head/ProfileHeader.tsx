import { FC, ReactNode } from 'react'
import { BLEED } from '../Container'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, Crown, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FollowListKind } from '@/lib/follows'
import { bannerTintCss, uploadedBanner } from '@/lib/banners'
import type { SupporterBadgeKind } from '@/lib/supporter'
import type { StaffBadgeKind } from '@/lib/staffBadge'
import { profileLinkLabel, readerName } from '@/lib/profile'
import TierAvatar from './TierAvatar'
import StaffSeal from './StaffSeal'
import FollowListStat from './FollowListStat'

// No "use client": the public profile renders this on the server. Only the owner's
// view, itself a client component, passes onAvatarClick.

export interface ProfileStat {
  // null shows the label alone (the owner's view of counts they've hidden).
  value: number | null
  label: string
  href?: string
  // Opens this profile's follower or following list.
  followList?: { username: string; kind: FollowListKind }
}

interface ProfileHeaderProps {
  username: string
  // Heads the profile when set, with @username under it; otherwise the username heads it.
  displayName?: string | null
  bio?: string | null
  // Their links (TikTok, a newsletter…), as chips under the bio.
  links?: string[]
  image?: string | null
  // Their uploaded picture, if any. Anything else (empty, an old "preset:<id>") gets the strip of their colour.
  banner?: string | null
  colour?: string | null
  stats: ProfileStat[]
  actions?: ReactNode
  // The share icon, after the buttons.
  share?: ReactNode
  children?: ReactNode
  onAvatarClick?: () => void
  booksRead: number
  // A Bookmark Plus account: says so, in words, after the handle.
  supporter?: boolean
  // A founder on Plus: the badge reads "Founding Reader".
  founding?: boolean
  // Which supporter badge, when the profile has one. Takes over from supporter/founding.
  badge?: SupporterBadgeKind | null
  // "Bookmark team" or "Librarian" (lib/staffBadge.ts): a seal beside the name, as on their other pages.
  staffBadge?: StaffBadgeKind | null
  // The profile in bands (Band.tsx). `besides` (what they're reading, what's next) sits beside the
  // header from lg up, which becomes a column; `identityFooter` ends that column from lg up;
  // `follows` puts the first authors they follow under the bio; `compact` keeps a banner shorter
  // on a wide screen, so the first band starts higher.
  besides?: ReactNode
  // Below lg only: the books that open the profile (their favourites, BOO-99). Under the header on a phone, beside
  // it from md, where the header alone would leave half the width empty. From lg up they're in `besides`.
  lead?: ReactNode
  // False keeps `lead` off a phone, for a caller that places it lower there (your own profile, where what you're
  // reading comes first).
  leadOnPhone?: boolean
  identityFooter?: ReactNode
  follows?: { name: string; slug: string }[]
  // Your own profile: with no followed authors, a line pointing you to some instead of nothing.
  followsPrompt?: boolean
  compact?: boolean
}

// How many followed authors the line under the bio names before "and N more".
const FOLLOWS_NAMED = 2

// "Follows Ursula K. Le Guin, Kazuo Ishiguro and 18 more", each name linking to the author's page and the
// rest to the authors section further down the profile.
const FollowsLine: FC<{ authors: { name: string; slug: string }[] }> = ({ authors }) => {
  const named = authors.slice(0, FOLLOWS_NAMED)
  const rest = authors.length - named.length
  const linkClass = "text-foreground hover:underline underline-offset-2"
  return (
    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
      Follows{" "}
      {named.map((a, i) => (
        <span key={a.slug}>
          {i > 0 && (i === named.length - 1 && rest === 0 ? " and " : ", ")}
          <Link href={`/authors/${encodeURIComponent(a.slug)}`} className={linkClass}>{a.name}</Link>
        </span>
      ))}
      {rest > 0 && <> and <a href="#profile-authors" className={linkClass}>{rest} more</a></>}
    </p>
  )
}

const BADGE: Record<SupporterBadgeKind, { label: string; title: string }> = {
  patron: { label: "Patron", title: "Supports Bookmark as a Patron" },
  lifetime: { label: "Lifetime", title: "Has lifetime Bookmark Plus" },
  founding: { label: "Founding Reader", title: "One of Bookmark's founding Plus supporters" },
  supporter: { label: "Supporter", title: "Supports Bookmark with Plus" },
}

// The Plus badge beside the name: a pill in the brand colour, linking to what Plus is.
const SupporterBadge: FC<{ kind: SupporterBadgeKind }> = ({ kind }) => (
  <Link
    href="/plus"
    title={BADGE[kind].title}
    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 align-middle text-xs font-medium text-brand-fill transition hover:bg-brand/15 dark:text-brand"
  >
    <Crown size={12} aria-hidden /> {BADGE[kind].label}
  </Link>
)

// 44px tall on touch screens, compact with a mouse (see the pointer-fine variant in tailwind.config.ts).
export const primaryButtonClass = "inline-flex items-center justify-center gap-2 h-11 pointer-fine:h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
export const secondaryButtonClass = "inline-flex items-center justify-center gap-2 h-11 pointer-fine:h-9 px-4 rounded-md text-sm font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"

const Stat: FC<{ stat: ProfileStat }> = ({ stat }) => {
  const content = (
    <>
      {stat.value !== null && <><span className="font-medium text-foreground tabular-nums">{stat.value}</span> </>}{stat.label}
    </>
  )
  const className = "text-sm text-muted-foreground whitespace-nowrap"
  if (stat.href) return <Link href={stat.href} className={cn(className, "hover:text-foreground transition")}>{content}</Link>
  if (stat.followList) return <FollowListStat {...stat.followList} className={cn(className, "hover:text-foreground transition")}>{content}</FollowListStat>
  return <span className={className}>{content}</span>
}

// A reader's links, labelled by where they go. They lead off Bookmark, so they open in a new tab and
// carry no endorsement (nofollow ugc); `me` lets sites that check it verify the profile.
const ProfileLinks: FC<{ links: string[] }> = ({ links }) => (
  <ul aria-label="Links" className="mt-3 flex flex-wrap gap-2">
    {links.map((link) => (
      <li key={link}>
        <a href={link} target="_blank" rel="me nofollow ugc noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-sm font-medium text-foreground transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-neutral-800 dark:hover:bg-neutral-700">
          <Link2 size={14} aria-hidden /> {profileLinkLabel(link)}
        </a>
      </li>
    ))}
  </ul>
)

const ProfileHeader: FC<ProfileHeaderProps> = ({ username, displayName, bio, links, image, banner, colour, stats, actions, share, children, onAvatarClick, booksRead, supporter, founding, badge, staffBadge, besides, lead, leadOnPhone = true, identityFooter, follows, followsPrompt = false, compact = false }) => {
  const accent = colour || "#F13C3C"
  // Every profile has a banner (BOO-99): their picture, or a strip of their colour mixed well into the page, so
  // the covers stay the brightest thing on it. The avatar rides up over it and the name sits underneath.
  const upload = uploadedBanner(banner)
  const badgeKind: SupporterBadgeKind | null = badge ?? (supporter ? (founding ? "founding" : "supporter") : null)
  const name = readerName({ username, displayName })
  const split = name.lastIndexOf(" ") + 1
  const leadingWords = name.slice(0, split)
  const lastWord = name.slice(split)
  // A rounded square for a Plus supporter (the badge beside the handle says so too), a circle for everyone else,
  // in the full frame from before BOO-97: an edge of the page lifts it off the banner, then a band of their tier's
  // metal.
  const plus = !!badgeKind
  const avatar = (
    <TierAvatar image={image} username={username} colour={accent} alt={`${name}'s avatar`} booksRead={booksRead} square={plus} className="size-20 sm:size-28" />
  )
  const avatarButton = onAvatarClick ? (
    <button type="button" onClick={onAvatarClick} aria-label="View profile picture" className={cn("block shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", plus ? "rounded-[32px]" : "rounded-full")}>
      {avatar}
    </button>
  ) : avatar
  const nameBlock = (
    <div className="min-w-0">
      <h1 className="page-title break-words">
        {/* The seal is held to the name's last word, or a line break can fall before it and leave it alone on the
            next line. A very long last word (a 30-letter username) is left free to break instead. */}
        {staffBadge && lastWord.length <= 14 ? (
          <>{leadingWords}<span className="whitespace-nowrap">{lastWord}<StaffSeal kind={staffBadge} name={name} size={22} className="ml-2 align-[-2px]" /></span></>
        ) : (
          <>{name}{staffBadge && <StaffSeal kind={staffBadge} name={name} size={22} className="ml-2 align-[-2px]" />}</>
        )}
      </h1>
      {/* Under the name: the handle (it's the /u/ address and how friends find them) and the Plus badge. */}
      {(displayName || badgeKind) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {displayName && <span className="break-all">@{username}</span>}
          {badgeKind && <SupporterBadge kind={badgeKind} />}
        </p>
      )}
    </div>
  )

  return (
    <header>
      <div className={cn("relative h-24 sm:h-44 overflow-hidden sm:rounded-2xl", compact && "lg:h-32", BLEED)} style={{ background: upload ? accent : bannerTintCss(accent) }}>
        {upload && <Image src={upload} alt="" fill priority sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />}
      </div>

      {/* In bands (`besides`), from lg up this is the left third of a grid and the books sit in the other two
          thirds. Below lg it's the header as ever, with the books under it. */}
      <div data-top-grid className={cn(besides && "lg:grid lg:grid-cols-12 lg:gap-16")}>
      {/* From md to lg, the header and `lead` side by side. From lg up this wrapper always steps aside (contents), with
          or without a lead, so the header's column is a cell of the grid above, not this wrapper. */}
      <div className={cn("lg:contents", lead && "md:grid md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8")}>
      <div data-identity className={cn("min-w-0 sm:max-w-md lg:max-w-none", besides && "lg:col-span-4 lg:flex lg:flex-col lg:self-start")}>
        <div className="relative -mt-10 sm:-mt-14 w-fit">{avatarButton}</div>
        <div className="mt-3">{nameBlock}</div>

        {bio && <p className="mt-4 max-w-xl text-sm text-foreground/80">{bio}</p>}
        {links && links.length > 0 && <ProfileLinks links={links} />}
        {/* One line of counts, the dots between them out of the way of screen readers. */}
        {stats.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5">
            {stats.map((stat, i) => (
              <span key={stat.label} className="inline-flex items-center gap-x-1.5">
                {i > 0 && <span aria-hidden className="text-sm text-muted-foreground">·</span>}
                <Stat stat={stat} />
              </span>
            ))}
          </p>
        )}
        {follows && follows.length > 0 && <FollowsLine authors={follows} />}
        {follows && follows.length === 0 && followsPrompt && (
          <Link href="/discover" className="mt-2 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
            Follow authors you love<ChevronRight size={14} aria-hidden />
          </Link>
        )}
        {/* The first button takes the width (Edit profile, Follow); the share icon and the menu sit after it. */}
        {(actions || share) && (
          <div className="mt-5 flex min-w-0 items-center gap-2 [&>*:first-child]:flex-1">
            {actions}{share}
          </div>
        )}

        {children}
        {besides && identityFooter && <div className="hidden lg:block">{identityFooter}</div>}
      </div>
      {lead && (
        // Its heading starts level with the name, under the overlapping photo (mt-16), rather than floating between
        // the two.
        <div data-lead className={cn("mt-6 min-w-0 border-t border-neutral-200 pt-6 dark:border-neutral-800 md:mt-16 md:border-t-0 md:pt-0 lg:hidden", !leadOnPhone && "max-md:hidden")}>
          {lead}
        </div>
      )}
      </div>
      {besides && <div data-books className={cn("mt-10 min-w-0 border-t border-neutral-200 pt-10 dark:border-neutral-800 lg:col-span-8 lg:self-start lg:mt-16 lg:border-t-0 lg:pt-0")}>{besides}</div>}
      </div>
    </header>
  )
}

export default ProfileHeader
