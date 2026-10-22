import type { Book } from "@prisma/client"
import type { KeyedMutator } from "swr"
import { notify, deleteKeepalive } from "@/lib/notify"
import { refreshAfterBookChange } from "@/app/hooks/refreshAfterBookChange"

// Removing a book from the shelf: the card goes straight away and a toast offers Undo for a few
// seconds. The delete only runs once the toast is gone, so Undo never has to bring a deleted book
// back; it just refetches the shelf. Shared by every card menu that offers "Remove".
export function removeBookWithUndo(book: Book, mutateBooks: KeyedMutator<any>, mutateFavourites: () => void) {
  mutateBooks((books?: Book[]) => books?.filter((b) => b.id !== book.id), { revalidate: false })

  const commit = () => {
    deleteKeepalive(`/api/books/${book.id}`)
      .then(() => {
        refreshAfterBookChange()
        mutateFavourites()
      })
      .catch(() => {
        mutateBooks()
        notify.error(`Couldn't remove "${book.title}".`, { retry: commit })
      })
  }

  notify.undo(`Removed "${book.title}"`, {
    onUndo: () => { mutateBooks() },
    commit,
  })
}
