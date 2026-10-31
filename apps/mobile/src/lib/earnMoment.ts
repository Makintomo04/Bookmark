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

// The reminders sheet (components/reminders/RemindersSheet.tsx) waiting to open: once, after the first book a
// reader finishes here, when the server says so (askReminders). It waits for the celebration to close.
export const useRemindersPrompt = create<{ asked: boolean; done: () => void }>((set) => ({
  asked: false,
  done: () => set({ asked: false }),
}));

export function celebrate(moment: EarnMoment | null | undefined, askReminders?: boolean) {
  if (askReminders) useRemindersPrompt.setState({ asked: true });
  if (!moment) return;
  if (moment.medals.length > 0) return useEarnMoment.setState({ moment, note: null });
  const line = finishLine(moment);
  if (line) useEarnMoment.setState({ note: line });
}
