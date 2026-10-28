import useSettings from "./useSettings"
import type { ProfileSection } from "@/lib/profileSections"

// Which sections of your own profile are folded up, as ShelfSection's `collapsed` and `onToggle` for
// each. Saved with your settings (optimistically, so the section folds straight away), so your phone and
// laptop agree. Until they've loaded nothing is collapsible; on someone else's profile this isn't asked.
export default function useCollapsedSections() {
  const { settings, save } = useSettings()
  const collapsed = settings?.collapsedSections
  return (id: ProfileSection): { collapsed?: boolean; onToggle?: () => void } => {
    if (!collapsed) return {}
    const isCollapsed = collapsed.includes(id)
    return {
      collapsed: isCollapsed,
      onToggle: () => save("collapsedSections", isCollapsed ? collapsed.filter((s) => s !== id) : [...collapsed, id]),
    }
  }
}
