import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'comfortable' | 'compact'

interface IViewModeStore {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

export const useViewMode = create<IViewModeStore>()(
  persist(
    (set) => ({
      viewMode: 'comfortable',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    { name: 'bookmark-view-mode' }
  )
)

export default useViewMode
