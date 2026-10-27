import { create } from "zustand"
import { finishLine, type EarnMoment } from "@bookmark/shared/earnMoment"
import { notify } from "@/lib/notify"

// The medal celebration on screen (components/achievements/EarnCelebration.tsx), if any.
interface EarnMomentStore {
  moment: EarnMoment | null
  show: (moment: EarnMoment) => void
  clear: () => void
}

export const useEarnMoment = create<EarnMomentStore>((set) => ({
  moment: null,
  show: (moment) => set({ moment }),
  clear: () => set({ moment: null }),
}))

type Toast = { message: string, action?: { label: string, onClick: () => void } }

// After a save: new medals get the celebration (which carries the goal and next-medal line itself);
// otherwise the save's own toast, with where a finished book leaves the reader underneath it.
export function celebrate(moment: EarnMoment | null | undefined, toast: Toast | null) {
  if (moment && moment.medals.length > 0) {
    useEarnMoment.getState().show(moment)
    return
  }
  if (!toast) return
  const description = moment ? finishLine(moment) ?? undefined : undefined
  notify.success(toast.message, { description, action: toast.action })
}
