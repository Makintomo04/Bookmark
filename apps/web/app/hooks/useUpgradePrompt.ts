import { create } from 'zustand'
import type { AllowanceKey, EntitlementKey } from '@/lib/entitlements'

// The Plus prompt, asked in place (BOO-94): a free reader picked something that's part of Plus (the stats
// explorer, a Plus card design). Rather than open a page that only says no, the link opens this sheet naming
// the feature, like the join prompt does for signed-out visitors. "Not now" only closes it.

interface UpgradePromptStore {
  isOpen: boolean
  feature: EntitlementKey | AllowanceKey | null
  onOpen: (feature: EntitlementKey | AllowanceKey) => void
  onClose: () => void
}

export const useUpgradePrompt = create<UpgradePromptStore>((set) => ({
  isOpen: false,
  feature: null,
  onOpen: (feature) => set({ isOpen: true, feature }),
  onClose: () => set({ isOpen: false }),
}))

// What a Plus-only control does for a free reader.
export function askToUpgrade(feature: EntitlementKey | AllowanceKey) {
  useUpgradePrompt.getState().onOpen(feature)
}

export default useUpgradePrompt
