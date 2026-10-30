"use client"
import { FC, ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useOwnerLists } from '@/app/hooks/useLists'
import useListEditorModal, { emptyList } from '@/app/hooks/useListEditorModal'
import useUser from '@/app/hooks/useUser'
import useCollapsedSections from '@/app/hooks/useCollapsedSections'
import { preferencesOf } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import { ListsSkeleton } from '../profile-head/ProfileSkeleton'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import ListCard from './ListCard'
import FetchErrorState from '../FetchErrorState'

interface ProfileListsProps {
  username: string
  isSelf: boolean
  // Beside favourites near the top of someone's profile (ProfileShowcase): no top margin, two lists to a
  // row, and the first two until "See all" opens the lists page (/u/<name>/lists). On a row of their own
  // they show the first four, and "See all" opens the same page.
  half?: boolean
  // At the top of a profile, where the section above sets the spacing: no top margin of its own.
  flush?: boolean
  // In bands: on a phone the lists are a row you swipe rather than a grid (with `half`, more than the two
  // it shows from sm up).
  swipe?: boolean
  // A line under the heading (your profile in bands: how to add a favourite, when you have none).
  footnote?: ReactNode
}

// Lists shown before "See all": two when they share a row with favourites, four when they have a row to themselves.
const HALF_SHOWN = 2
const FULL_SHOWN = 4
// Lists in the row you swipe on a phone.
const SWIPE_SHOWN = 8

const ProfileLists: FC<ProfileListsProps> = ({ username, isSelf, half = false, flush = false, swipe = false, footnote }) => {
  const { lists, isLoading, isError, mutate } = useOwnerLists(username)
  const { onOpen } = useListEditorModal()
  const { user } = useUser()
  const collapse = useCollapsedSections()

  if (isLoading) return <ListsSkeleton half={half} swipe={swipe} className={half || flush ? undefined : "mt-12"} />
  if (isError) {
    // Only the owner gets an error: on someone else's profile a missing section reads the same as none.
    return isSelf ? <div className="mt-12"><FetchErrorState error={isError} what="your lists" onRetry={() => mutate()} /></div> : null
  }
  // Someone else's profile with no public lists: nothing worth a section.
  if (lists.length === 0 && !isSelf) return null

  const newList = (
    <button type="button" onClick={() => onOpen(emptyList(false, user ? preferencesOf(user).defaultListVisibility : undefined))} className={cn(secondaryButtonClass, half && "px-2.5")} title={half ? "New list" : undefined}>
      <Plus size={16} aria-hidden />
      {/* Half a column is too narrow for the words beside "See all": an icon, with the label for screen readers. */}
      <span className={half ? "sr-only" : undefined}>New list</span>
    </button>
  )

  // Swiping, the phone gets up to SWIPE_SHOWN in its row; from sm up, the rest past the cap stay hidden.
  const cap = half ? HALF_SHOWN : FULL_SHOWN
  const shown = lists.slice(0, swipe ? SWIPE_SHOWN : cap)
  // On a phone that swipes through eight, "See all" is only for the reader with more than that.
  const seeAll = lists.length > cap
    ? <span className={cn("whitespace-nowrap", swipe && lists.length <= SWIPE_SHOWN && "max-sm:hidden")}><SeeAllLink href={`/u/${encodeURIComponent(username)}/lists`} /></span>
    : null
  const action = isSelf && lists.length > 0 ? <div className="flex items-center gap-3 whitespace-nowrap">{seeAll}{newList}</div> : seeAll ?? undefined

  return (
    <div className={half || flush ? undefined : "mt-12"}>
      <ShelfSection id="profile-lists" title="Lists" count={lists.length} action={action} {...(isSelf ? collapse("profile-lists") : {})}>
        {footnote && <div className="-mt-3 mb-4">{footnote}</div>}
        {lists.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
            <div>
              <p className="font-medium">Make your first list</p>
              <p className="mt-1 text-sm text-muted-foreground">Group books you&apos;d recommend: a genre you love, a theme, a reading challenge. Make it public and other readers can find you through it.</p>
            </div>
            <div className="shrink-0">{newList}</div>
          </div>
        ) : (
          <div className={cn(
            half ? "grid grid-cols-2 gap-x-5 gap-y-8" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8",
            swipe && "max-sm:relative max-sm:flex max-sm:overflow-x-auto max-sm:snap-x max-sm:-mx-4 max-sm:px-4 max-sm:pb-1 max-sm:[&>*]:w-[44%] max-sm:[&>*]:shrink-0 max-sm:[&>*]:snap-start",
            swipe && (half ? "sm:[&>*:nth-child(n+3)]:hidden" : "sm:[&>*:nth-child(n+5)]:hidden"),
          )}>
            {shown.map((list) => <ListCard key={list.id} list={list} hideOwner />)}
          </div>
        )}
      </ShelfSection>
    </div>
  )
}

export default ProfileLists
