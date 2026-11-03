import { FC } from 'react'
import { cn } from '@/lib/utils'
import { BLEED } from '../Container'
import { Skeleton } from '../ui/skeleton'
import { coverOnlyGridClass } from '../books/shelf'

// Loading shapes for a profile. Each is built from the same wrappers, spacing and sizes as the section it stands
// in for (ProfileHeader, FavouritesRow, ContinueReading, ProfileLists, the shelves), so when the content lands
// nothing jumps: the header grid, its columns, every heading's height and the covers' 2:3 are the real ones.
// No hooks, so the route's loading.tsx can use them too.

// A section heading's slot (ShelfSection): 40px tall, the title a little under 28px of text.
const Heading: FC<{ className?: string }> = ({ className = "w-32" }) => (
  <div className="mb-5 flex min-h-10 items-center"><Skeleton className={cn("h-6", className)} /></div>
)

// Covers only (FavouritesRow): three in view below lg, four across from lg.
export const favouritesSkeletonGridClass = "grid grid-cols-3 gap-x-3 sm:gap-x-4 gap-y-4 lg:grid-cols-4"

export const FavouritesSkeleton: FC = () => (
  <div>
    <Heading />
    <div className={favouritesSkeletonGridClass}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className={cn("aspect-[2/3] w-full", i === 3 && "max-lg:hidden")} />
      ))}
    </div>
  </div>
)

// What they're reading: the tiles are 96px (cover, title, author), one on a phone and two from sm up. On your own
// profile (`progress`) each also has where you are and its bar, which makes the card taller.
export const ReadingNowSkeleton: FC<{ title?: boolean; progress?: boolean; heading?: string }> = ({ title = true, progress = false, heading = "w-28" }) => (
  <div>
    {title && <Heading className={heading} />}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className={cn("flex items-center gap-4 py-2", progress ? "min-h-32" : "min-h-24", i === 1 && "max-sm:hidden")}>
          <Skeleton className={cn("self-stretch rounded-md", progress ? "w-20" : "w-12")} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3.5 w-2/5" />
            {progress && <><Skeleton className="mt-3 h-3 w-1/2" /><Skeleton className="h-1.5 w-full rounded-full" /></>}
          </div>
        </div>
      ))}
    </div>
  </div>
)

// A list card: its fanned covers (h-36, h-40 from sm up), the title and its count.
const ListCardSkeleton: FC<{ className?: string }> = ({ className }) => (
  <div className={cn("flex flex-col gap-3", className)}>
    <Skeleton className="h-36 rounded-xl sm:h-40" />
    {/* A one-line title (22px) and its count (16px), 4px apart, as ListCard sets them. */}
    <div className="flex flex-col gap-1">
      <div className="flex h-[22px] items-center"><Skeleton className="h-4 w-4/5" /></div>
      <div className="flex h-4 items-center"><Skeleton className="h-3 w-2/5" /></div>
    </div>
  </div>
)

// Lists as ProfileLists lays them out: a row you swipe on a phone with `swipe`, otherwise a grid, up to four to a
// row, or two to a row beside favourites (`half`).
export const ListsSkeleton: FC<{ half?: boolean; swipe?: boolean; className?: string }> = ({ half = false, swipe = false, className }) => (
  <div className={className}>
    <Heading className="w-16" />
    <div className={cn(
      half ? "grid grid-cols-2 gap-x-5 gap-y-8" : "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4",
      swipe && "max-sm:relative max-sm:flex max-sm:-mx-4 max-sm:overflow-hidden max-sm:px-4 max-sm:[&>*]:w-[44%] max-sm:[&>*]:shrink-0",
    )}>
      {(half ? [0, 1] : [0, 1, 2, 3]).map((i) => <ListCardSkeleton key={i} className={!half && i === 3 ? "sm:max-lg:hidden" : undefined} />)}
    </div>
  </div>
)

// The shelves as tabs. `own`: your profile, where the search is at the top of the page, so the tab row also
// holds sort and the view. Someone else's: the tab row, then a row of search, sort, filter and the view.
export const ShelvesSkeleton: FC<{ own?: boolean; label?: string }> = ({ own = false, label = "Loading shelves" }) => (
  <div className="w-full" aria-busy="true" aria-label={label}>
    <div className={cn("flex items-center gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800 sm:gap-3 sm:pb-3", own ? "mb-6" : "mb-4")}>
      <div className="flex min-w-0 flex-1 gap-1">
        {["w-32", "w-24", "w-16"].map((w) => <Skeleton key={w} className={cn("h-9 shrink-0 rounded-full", w)} />)}
      </div>
      {own && <div className="hidden shrink-0 items-center gap-2 sm:flex"><Skeleton className="h-9 w-36 rounded-full" /><Skeleton className="h-10 w-[72px] rounded-full" /></div>}
    </div>
    {!own && (
      <div className="mb-6 flex items-center gap-1.5 sm:gap-2">
        <Skeleton className="h-10 min-w-0 flex-1 rounded-full sm:min-w-[12rem]" />
        <Skeleton className="h-10 w-10 shrink-0 rounded-full sm:w-36" />
        <Skeleton className="h-10 w-10 shrink-0 rounded-full sm:w-24" />
        <Skeleton className="h-10 w-[72px] shrink-0 rounded-full" />
      </div>
    )}
    <div className={coverOnlyGridClass}>
      {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}
    </div>
  </div>
)

interface ProfileSkeletonProps {
  // Your own profile: Edit profile and share in the column, and the shelves' own tab row.
  own?: boolean
  // The shelves under the header. Off where they're drawn separately, as on your own profile.
  shelves?: boolean
}

// The whole profile in bands: the banner, then the header's column (avatar over the banner, name and handle under it,
// bio, counts, buttons, the goal and, from lg up, the rows for achievements and stats) beside what they're reading,
// favourites and lists, then the shelves. Every profile has a banner (BOO-99).
export const ProfileSkeleton: FC<ProfileSkeletonProps> = ({ own = false, shelves = true }) => (
  <div className="w-full" aria-busy="true" aria-label="Loading profile">
    <Skeleton className={cn("h-24 rounded-none sm:h-44 sm:rounded-2xl lg:h-32", BLEED)} />
    <div className="lg:grid lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-4 lg:flex lg:flex-col lg:self-start">
        <Skeleton className="relative -mt-10 size-20 rounded-full ring-4 ring-background sm:-mt-14 sm:size-28" />
        <Skeleton className="mt-3 h-9 w-48 max-w-full sm:h-[42px]" />
        <Skeleton className="mt-1.5 h-5 w-32" />
        <Skeleton className="mt-4 h-5 w-72 max-w-full" />
        <Skeleton className="mt-3 h-5 w-56 max-w-full" />
        <div className="mt-5 flex items-center gap-2 sm:max-w-sm lg:max-w-none">
          <Skeleton className="h-11 flex-1 rounded-md pointer-fine:h-9" />
          {!own && <Skeleton className="h-11 w-11 rounded-md pointer-fine:h-9 pointer-fine:w-9" />}
          <Skeleton className="h-11 w-11 rounded-full pointer-fine:size-9" />
        </div>
      </div>
      <div className="mt-10 flex min-w-0 flex-col gap-10 lg:col-span-8 lg:mt-16 lg:self-start">
        <ReadingNowSkeleton />
        <FavouritesSkeleton />
        <ListsSkeleton swipe />
      </div>
    </div>
    {shelves && <div className="mt-12"><ShelvesSkeleton own={own} /></div>}
  </div>
)

export default ProfileSkeleton
