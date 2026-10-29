"use client"
import { FC } from 'react'
import axios from 'axios'
import { Bookmark } from 'lucide-react'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useFavourite from '@/app/hooks/useFavourite'

// The bookmark that adds a book to your favourites, as on BookActions' plain tone. It fills as soon as it's
// tapped, then settles on what the server saved.
const FavouriteButton: FC<{ bookId: string; className?: string }> = ({ bookId, className }) => {
  const { mutate: mutateUser } = useUser()
  const { hasFavourited, mutate: mutateFav } = useFavourite()
  const isFavourite = hasFavourited(bookId)

  const toggle = () => {
    mutateFav((data: any) => data && ({
      ...data,
      favouriteIds: isFavourite ? data.favouriteIds.filter((id: string) => id !== bookId) : [...data.favouriteIds, bookId],
    }), { revalidate: false })
    axios.post(`/api/favourites/${bookId}`).catch(() => {
      notify.error(isFavourite ? "Couldn't remove it from your favourites." : "Couldn't add it to your favourites.", { retry: toggle })
    }).finally(() => {
      mutateFav()
      mutateUser()
    })
  }

  return (
    <button
      type="button"
      aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={isFavourite}
      onClick={toggle}
      className={cn("h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition text-muted-foreground hover:text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Bookmark size={16} className={cn(isFavourite && "fill-current text-[#F13C3C]")} />
    </button>
  )
}

export default FavouriteButton
