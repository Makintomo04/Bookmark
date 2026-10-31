import { create } from 'zustand'

// The join prompt (BOO-53): a signed-out visitor tried something only members can do (follow someone,
// shelve a book, copy a list). It asks then, at the moment of intent, rather than on arrival or on scroll.
// `kind` groups actions so "Not now" quiets that kind for the rest of the visit (JoinPromptModal).
export type JoinPromptKind = 'follow' | 'shelf' | 'list' | 'circle'

interface JoinPromptStore {
  isOpen: boolean
  kind: JoinPromptKind
  // Names the action: "Join to add Piranesi to your shelf".
  heading: string
  // Where sign-up and sign-in come back to; this page when unset.
  back: string | null
  onOpen: (kind: JoinPromptKind, heading: string, back?: string) => void
  onClose: () => void
}

export const useJoinPrompt = create<JoinPromptStore>((set) => ({
  isOpen: false,
  kind: 'shelf',
  heading: '',
  back: null,
  onOpen: (kind, heading, back) => set({ isOpen: true, kind, heading, back: back ?? null }),
  onClose: () => set({ isOpen: false }),
}))

const quietKey = (kind: JoinPromptKind) => `bookmark.joinPrompt.notNow.${kind}`

// "Not now" for this kind of action, for the rest of this browser session.
export function quietJoinPrompt(kind: JoinPromptKind) {
  try { sessionStorage.setItem(quietKey(kind), '1') } catch {}
}

export function joinPromptQuiet(kind: JoinPromptKind) {
  try { return sessionStorage.getItem(quietKey(kind)) === '1' } catch { return false }
}

// Where sign-up and sign-in should bring them back to: the page they were on.
export const hereForCallback = () => encodeURIComponent(`${window.location.pathname}${window.location.search}`)

// What a members-only control does for a signed-out visitor: the prompt, or, once they've said "Not now" to
// this kind, straight to sign-up (they pressed it again, so they mean it). `back` is a path to return to.
export function askToJoin(kind: JoinPromptKind, heading: string, back?: string) {
  if (joinPromptQuiet(kind)) {
    window.location.assign(`/register?callbackUrl=${back ? encodeURIComponent(back) : hereForCallback()}`)
    return
  }
  useJoinPrompt.getState().onOpen(kind, heading, back)
}

export default useJoinPrompt
