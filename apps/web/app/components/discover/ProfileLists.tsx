"use client"
import { FC, useState } from 'react'
import { Plus } from 'lucide-react'
import { useOwnerLists } from '@/app/hooks/useLists'
import useListEditorModal, { emptyList } from '@/app/hooks/useListEditorModal'
import useUser from '@/app/hooks/useUser'
import { preferencesOf } from '@/lib/preferences'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import { Skeleton } from '../ui/skeleton'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import ListCard from './ListCard'
import FetchErrorState from '../FetchErrorState'

interface ProfileListsProps {
  username: string
  isSelf: boolean
  // Beside favourites near the top of someone's profile (ProfileShowcase): no top margin, two lists to a
  // row, and the first two until "See all" opens the rest in place.
  half?: boolean
  // At the top of a profile, where the section above sets the spacing: no top margin of its own.
  flush?: boolean
}

// Lists shown in half a row before "See all".
const HALF_SHOWN = 2

const ProfileLists: FC<ProfileListsProps> = ({ username, isSelf, half = false, flush = false }) => {
  const { lists, isLoading, isError, mutate } = useOwnerLists(username)
  const [all, setAll] = useState(false)
  const { onOpen } = useListEditorModal()
  const { user } = useUser()

  if (isLoading) {
    return (
      <div className={half ? "grid grid-cols-2 gap-5" : "mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5"}>
        {(half ? [0, 1] : [0, 1, 2, 3]).map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    )
  }
  if (isError) {
    // Only the owner gets an error: on someone else's profile a missing section reads the same as none.
    return isSelf ? <div className="mt-12"><FetchErrorState error={isError} what="your lists" onRetry={() => mutate()} /></div> : null
  }
  // Someone else's profile with no public lists: nothing worth a section.
  if (lists.length === 0 && !isSelf) return null

  const newList = (
    <button type="button" onClick={() => onOpen(emptyList(false, user ? preferencesOf(user).defaultListVisibility : undefined))} className={secondaryButtonClass}>
      <Plus size={16} aria-hidden />New list
    </button>
  )

  const shown = half && !all ? lists.slice(0, HALF_SHOWN) : lists
  const action = isSelf && lists.length > 0 ? newList
    : half && !all && lists.length > HALF_SHOWN ? <SeeAllLink onClick={() => setAll(true)} />
    : undefined

  return (
    <div className={half || flush ? undefined : "mt-12"}>
      <ShelfSection id="profile-lists" title="Lists" count={lists.length} action={action}>
        {lists.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
            <div>
              <p className="font-medium">Make your first list</p>
              <p className="mt-1 text-sm text-muted-foreground">Group books you&apos;d recommend: a genre you love, a theme, a reading challenge. Make it public and other readers can find you through it.</p>
            </div>
            <div className="shrink-0">{newList}</div>
          </div>
        ) : (
          <div className={half ? "grid grid-cols-2 gap-x-5 gap-y-8" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8"}>
            {shown.map((list) => <ListCard key={list.id} list={list} hideOwner />)}
          </div>
        )}
      </ShelfSection>
    </div>
  )
}

export default ProfileLists
