import { create } from 'zustand'

// The join prompt (BOO-53): a signed-out visitor tried something only members can do (follow someone,
// shelve a book, copy a list). It asks then, at the moment of intent, rather than on arrival or on scroll,
// and every time they try: "Not now" only closes it (JoinPromptModal).

interface JoinPromptStore {
  isOpen: boolean
  // Names the action: "Join to add Piranesi to your shelf".
  heading: string
  // Where sign-up and sign-in come back to; this page when unset.
  back: string | null
  onOpen: (heading: string, back?: string) => void
  onClose: () => void
}

export const useJoinPrompt = create<JoinPromptStore>((set) => ({
  isOpen: false,
  heading: '',
  back: null,
  onOpen: (heading, back) => set({ isOpen: true, heading, back: back ?? null }),
  onClose: () => set({ isOpen: false }),
}))

// Where sign-up and sign-in should bring them back to: the page they were on.
export const hereForCallback = () => encodeURIComponent(`${window.location.pathname}${window.location.search}`)

// What a members-only control does for a signed-out visitor. `back` is a path to return to after joining.
export function askToJoin(heading: string, back?: string) {
  useJoinPrompt.getState().onOpen(heading, back)
}

export default useJoinPrompt
