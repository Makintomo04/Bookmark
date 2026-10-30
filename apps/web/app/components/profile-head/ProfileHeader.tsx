import { FC, ReactNode } from 'react'
import { BLEED } from '../Container'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FollowListKind } from '@/lib/follows'
import { bannerPresetOf, resolveBanner } from '@/lib/banners'
import type { SupporterBadgeKind } from '@/lib/supporter'
import type { StaffBadgeKind } from '@/lib/staffBadge'
import { readerName } from '@/lib/profile'
import BannerPattern from '../profile/BannerPattern'
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
  image?: string | null
  // An uploaded image URL or a "preset:<id>" pattern. Callers resolve the seeded default from the
  // user's id; with nothing passed, the username seeds one so the header never renders bare.
  banner?: string | null
  colour?: string | null
  stats: ProfileStat[]
  actions?: ReactNode
  // The share icon, beside the display name.
  share?: ReactNode
  children?: ReactNode
  onAvatarClick?: () => void
  booksRead: number
  // A Bookmark Plus account: shows the supporter badge beside the name.
  supporter?: boolean
  // A founder on Plus: the badge reads "Founding Reader".
  founding?: boolean
  // Which supporter badge, when the profile has one. Takes over from supporter/founding.
  badge?: SupporterBadgeKind | null
  // "Bookmark team" or "Librarian" (lib/staffBadge.ts): a seal on the avatar's corner.
  staffBadge?: StaffBadgeKind | null
  // The profile in bands (Band.tsx). `besides` (what they're reading, what's next) sits beside the
  // header from lg up, which becomes a column; `identityFooter` ends that column from lg up (top medals,
  // when the books beside it run longer);
  // `follows` puts the first authors they follow under the bio; `compact` keeps the banner shorter on a
  // wide screen, so the first band starts higher.
  besides?: ReactNode
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
    <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
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

// 44px tall on touch screens, compact with a mouse (see the pointer-fine variant in tailwind.config.ts).
export const primaryButtonClass = "inline-flex items-center justify-center gap-2 h-11 pointer-fine:h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
export const secondaryButtonClass = "inline-flex items-center justify-center gap-2 h-11 pointer-fine:h-9 px-4 rounded-md text-sm font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"

const Stat: FC<{ stat: ProfileStat }> = ({ stat }) => {
  const content = (
    <>
      {stat.value !== null && <><span className="font-semibold text-foreground tabular-nums">{stat.value}</span> </>}{stat.label}
    </>
  )
  const className = "text-sm text-muted-foreground whitespace-nowrap"
  if (stat.href) return <Link href={stat.href} className={cn(className, "hover:text-foreground transition")}>{content}</Link>
  if (stat.followList) return <FollowListStat {...stat.followList} className={cn(className, "hover:text-foreground transition")}>{content}</FollowListStat>
  return <span className={className}>{content}</span>
}

export const SupporterBadge: FC<{ founding?: boolean; kind?: SupporterBadgeKind }> = ({ founding, kind = founding ? "founding" : "supporter" }) => (
  <Link
    href="/plus"
    title={BADGE[kind].title}
    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 align-middle text-xs font-semibold text-brand-fill dark:text-brand transition hover:bg-brand/15"
  >
    <Crown size={12} aria-hidden /> {BADGE[kind].label}
  </Link>
)

const ProfileHeader: FC<ProfileHeaderProps> = ({ username, displayName, bio, image, banner, colour, stats, actions, share, children, onAvatarClick, booksRead, supporter, founding, badge, staffBadge, besides, identityFooter, follows, followsPrompt = false, compact = false }) => {
  const accent = colour || "#F13C3C"
  const shownBanner = resolveBanner(banner, username)
  const preset = bannerPresetOf(shownBanner)
  const plus = !!(badge || supporter)
  const name = readerName({ username, displayName })
  const avatar = (
    <TierAvatar image={image} username={username} colour={accent} alt={`${name}'s avatar`} booksRead={booksRead} square={plus} className="size-20 sm:size-28" />
  )

  return (
    <header>
      {/* Shorter on a phone, with the buttons beside the avatar, so the shelf's first cover is in view. The banner
          reaches the page's outer edge (edge to edge on a phone); everything else sits on the inner line. */}
      <div className={cn("relative h-24 sm:h-44 overflow-hidden sm:rounded-2xl", compact && "lg:h-32", BLEED)} style={{ background: accent }}>
        {preset
          ? <BannerPattern preset={preset} colour={accent} />
          : <Image src={shownBanner} alt="" fill priority sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />}
      </div>

      {/* In bands (`besides`), from lg up this is the left third of a grid and the books sit in the other two
          thirds; the buttons drop under the stats. Below lg it's the header as ever, with the books under it. */}
      <div data-top-grid className={cn(besides && "lg:grid lg:grid-cols-12 lg:gap-10")}>
      <div data-identity className={cn(besides && "lg:col-span-4 lg:flex lg:flex-col lg:self-start")}>
        <div className={cn("-mt-9 sm:-mt-14 flex items-end justify-between gap-3 sm:gap-4", besides && "lg:contents")}>
          {/* The seal sits beside the avatar's button, not in it, so it can be pressed on its own. */}
          <div className={cn("relative shrink-0", besides && "lg:-mt-14 lg:self-start")}>
            {onAvatarClick ? (
              <button type="button" onClick={onAvatarClick} aria-label="View profile picture" className={cn("block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", plus ? "rounded-[32px]" : "rounded-full")}>
                {avatar}
              </button>
            ) : avatar}
            {staffBadge && <StaffSeal kind={staffBadge} name={name} size={30} cutOut shine className={cn("absolute", plus ? "-right-1.5 bottom-0.5" : "right-0 bottom-[6%]")} />}
          </div>
          {/* On a phone the buttons are shorter, so beside the smaller avatar they clear the banner by 12px. */}
          {actions && <div className={cn("flex min-w-0 items-center gap-2 sm:pb-1 max-sm:[&>*]:h-8", besides && "lg:order-last lg:mt-5 lg:w-full lg:flex-wrap lg:pb-0")}>{actions}</div>}
        </div>

        <div className="mt-3 sm:mt-4 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="page-title break-words">{name}</h1>
            {share}
            {(badge || supporter) && (
              // Centring on the line box leaves the pills riding high beside Literata's lowercase,
              // so drop them to the middle of the name's x-height.
              <div className="flex flex-wrap items-center gap-2 translate-y-1">
                {badge ? <SupporterBadge kind={badge} /> : supporter && <SupporterBadge founding={founding} />}
              </div>
            )}
          </div>
          {/* The handle, under a display name: it's the /u/ address and how friends find them. */}
          {displayName && <p className="mt-2.5 text-sm text-muted-foreground break-all">@{username}</p>}
          {bio && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{bio}</p>}
          {follows && follows.length > 0 && <FollowsLine authors={follows} />}
          {follows && follows.length === 0 && followsPrompt && (
            <Link href="/discover" className="mt-1.5 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
              Follow authors you love<ChevronRight size={14} aria-hidden />
            </Link>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {stats.map((stat) => <Stat key={stat.label} stat={stat} />)}
          </div>
        </div>

        {children}
        {besides && identityFooter && <div className="hidden lg:block lg:order-last">{identityFooter}</div>}
      </div>
      {besides && <div data-books className="mt-8 min-w-0 lg:col-span-8 lg:mt-6 lg:self-start">{besides}</div>}
      </div>
    </header>
  )
}

export default ProfileHeader
