"use client"
import { FC } from 'react'
import { Plus } from 'lucide-react'
import { useOwnerLists } from '@/app/hooks/useLists'
import useListEditorModal, { emptyList } from '@/app/hooks/useListEditorModal'
import useUser from '@/app/hooks/useUser'
import { preferencesOf } from '@/lib/preferences'
import { ShelfSection } from '../books/shelf'
import { Skeleton } from '../ui/skeleton'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import ListCard from './ListCard'

interface ProfileListsProps {
  username: string
  isSelf: boolean
}

const ProfileLists: FC<ProfileListsProps> = ({ username, isSelf }) => {
  const { lists, isLoading } = useOwnerLists(username)
  const { onOpen } = useListEditorModal()
  const { user } = useUser()

  if (isLoading) {
    return (
      <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    )
  }
  // Someone else's profile with no public lists: nothing worth a section.
  if (lists.length === 0 && !isSelf) return null

  const newList = (
    <button type="button" onClick={() => onOpen(emptyList(false, user ? preferencesOf(user).defaultListVisibility : undefined))} className={secondaryButtonClass}>
      <Plus size={16} aria-hidden />New list
    </button>
  )

  return (
    <div className="mt-12">
      <ShelfSection id="profile-lists" title="Lists" count={lists.length} action={isSelf && lists.length > 0 ? newList : undefined}>
        {lists.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
            <div>
              <p className="font-medium">Make your first list</p>
              <p className="mt-1 text-sm text-muted-foreground">Group books you&apos;d recommend: a genre you love, a theme, a reading challenge. Make it public and other readers can find you through it.</p>
            </div>
            <div className="shrink-0">{newList}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
            {lists.map((list) => <ListCard key={list.id} list={list} hideOwner />)}
          </div>
        )}
      </ShelfSection>
    </div>
  )
}

export default ProfileLists
