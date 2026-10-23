import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import useUser from './useUser'

// Dev-only: pretend your own account has read this many books, to QA reader tiers
// without seeding data. Kept in this browser's storage; ignored in production.
interface TierPreviewStore {
  booksRead: number | null
  setBooksRead: (booksRead: number | null) => void
}

export const useTierPreview = create<TierPreviewStore>()(
  persist(
    (set) => ({
      booksRead: null,
      setBooksRead: (booksRead) => set({ booksRead }),
    }),
    { name: 'dev-tier-preview' }
  )
)

export const tierPreviewEnabled = process.env.NODE_ENV !== 'production'

// Returns a lookup for the books-read count a user's tier should show:
// the preview for your own account while one is set, otherwise their real count.
export function useBooksReadFor() {
  const preview = useTierPreview((s) => s.booksRead)
  const { user } = useUser()
  return (username: string | null | undefined, actual: number) =>
    tierPreviewEnabled && preview !== null && !!username && username === user?.username ? preview : actual
}
