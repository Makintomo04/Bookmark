"use client"
import { FC } from 'react'
import { Plus } from 'lucide-react'
import { useOwnerLists } from '@/app/hooks/useLists'
import useListEditorModal, { emptyList } from '@/app/hooks/useListEditorModal'
import useUser from '@/app/hooks/useUser'
import { preferencesOf } from '@/lib/preferences'
import { Skeleton } from '../ui/skeleton'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import FetchErrorState from '../FetchErrorState'
import ListCard from './ListCard'

// Every list a reader has, on /u/<name>/lists: the page "See all" on their profile's Lists section opens. Yours
// carry a New list button; someone else's show only what you may see of them.
const AllLists: FC<{ username: string; isSelf: boolean; name: string }> = ({ username, isSelf, name }) => {
  const { lists, isLoading, isError, mutate } = useOwnerLists(username)
  const { onOpen } = useListEditorModal()
  const { user } = useUser()

  return (
    <>
      <div className="mt-2 mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="page-title break-words">
          {isSelf ? "Your lists" : `${name}’s lists`}
          {!isLoading && !isError && <span className="ml-3 text-lg font-normal text-muted-foreground tabular-nums">{lists.length.toLocaleString('en-GB')}</span>}
        </h1>
        {isSelf && (
          <button type="button" onClick={() => onOpen(emptyList(false, user ? preferencesOf(user).defaultListVisibility : undefined))} className={secondaryButtonClass}>
            <Plus size={16} aria-hidden />New list
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : isError ? (
        <FetchErrorState error={isError} what="these lists" onRetry={() => mutate()} />
      ) : lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">{isSelf ? "Lists you make show up here." : "No lists to show."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {lists.map((list) => <ListCard key={list.id} list={list} hideOwner />)}
        </div>
      )}
    </>
  )
}

export default AllLists
