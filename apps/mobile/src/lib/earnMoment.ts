import { create } from "zustand";
import { finishLine, type EarnMoment } from "@bookmark/shared/earnMoment";
import type { AskReason } from "@bookmark/shared/reminders";

// What a save just earned (the web's useEarnMoment). New medals open the celebration; a finished book
// without one shows a short banner with the goal and the next medal. Both are drawn by
// components/achievements/EarnCelebration.tsx, mounted once in the signed-in layout.
interface EarnMomentStore {
  moment: EarnMoment | null;
  note: string | null;
  // The banner's heading: "Finished" for a finished book, unless something else set the note.
  noteTitle?: string;
  clear: () => void;
  clearNote: () => void;
}

export const useEarnMoment = create<EarnMomentStore>((set) => ({
  moment: null,
  note: null,
  clear: () => set({ moment: null }),
  clearNote: () => set({ note: null, noteTitle: undefined }),
}));

// The reminders sheet (components/reminders/RemindersSheet.tsx) waiting to open, once, when the server says
// so (askReminders: a first finish, a third day of reading, or a goal set). It waits for the celebration.
export const useRemindersPrompt = create<{ asked: AskReason | null; done: () => void }>((set) => ({
  asked: null,
  done: () => set({ asked: null }),
}));

export function celebrate(moment: EarnMoment | null | undefined, askReminders?: AskReason | false) {
  if (askReminders) useRemindersPrompt.setState({ asked: askReminders });
  if (!moment) return;
  if (moment.medals.length > 0) return useEarnMoment.setState({ moment, note: null });
  const line = finishLine(moment);
  if (line) useEarnMoment.setState({ note: line, noteTitle: undefined });
}
