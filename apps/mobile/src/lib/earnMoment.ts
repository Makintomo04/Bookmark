import { create } from "zustand";
import { finishLine, type EarnMoment } from "@bookmark/shared/earnMoment";

// What a save just earned (the web's useEarnMoment). New medals open the celebration; a finished book
// without one shows a short banner with the goal and the next medal. Both are drawn by
// components/achievements/EarnCelebration.tsx, mounted once in the signed-in layout.
interface EarnMomentStore {
  moment: EarnMoment | null;
  note: string | null;
  clear: () => void;
  clearNote: () => void;
}

export const useEarnMoment = create<EarnMomentStore>((set) => ({
  moment: null,
  note: null,
  clear: () => set({ moment: null }),
  clearNote: () => set({ note: null }),
}));

export function celebrate(moment: EarnMoment | null | undefined) {
  if (!moment) return;
  if (moment.medals.length > 0) return useEarnMoment.setState({ moment, note: null });
  const line = finishLine(moment);
  if (line) useEarnMoment.setState({ note: line });
}
