import { toast } from "sonner"

// Every piece of feedback the app shows after an action goes through here, so call sites never
// touch the toast library directly and the rules stay in one place:
//   - A visible state change (a button flipping, a modal closing, a page changing) is its own
//     confirmation. Only notify when the result isn't on screen.
//   - Validation belongs next to the field, not in a toast.
//   - Destructive actions act straight away and offer Undo, instead of asking "are you sure?".
//   - Errors say what failed and, where the action can simply be run again, offer Retry.

type Action = { label: string, onClick: () => void }

type Options = {
  description?: string
  action?: Action
}

const UNDO_MS = 6000

// Commits still waiting on an Undo toast. If the page is left before they fire, they run at once
// (with keepalive, so the request survives the unload) rather than being lost.
const pendingCommits = new Set<() => void>()
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    pendingCommits.forEach((commit) => commit())
    pendingCommits.clear()
  })
}

export const notify = {
  success(message: string, options?: Options) {
    toast.success(message, options)
  },

  info(message: string, options?: Options) {
    toast(message, options)
  },

  // `retry` re-runs the action from the toast; pass it only when running again is all that's needed.
  error(message: string, options?: Options & { retry?: () => void }) {
    const { retry, ...rest } = options ?? {}
    toast.error(message, { ...rest, action: rest.action ?? (retry ? { label: "Retry", onClick: retry } : undefined) })
  },

  // The undo pattern: the UI has already changed, `commit` makes it real once the toast is gone,
  // and Undo (`onUndo`) puts things back without `commit` ever running.
  undo(message: string, { onUndo, commit }: { onUndo: () => void, commit: () => void }) {
    let settled = false
    const run = () => {
      if (settled) return
      settled = true
      pendingCommits.delete(run)
      commit()
    }
    pendingCommits.add(run)
    toast(message, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (settled) return
          settled = true
          pendingCommits.delete(run)
          onUndo()
        },
      },
      onAutoClose: run,
      onDismiss: run,
    })
  },

  // One toast that moves from a loading state to the outcome, for actions that take a moment.
  promise<T>(promise: Promise<T>, messages: { loading: string, success: string | ((value: T) => string), error: string | ((err: unknown) => string) }) {
    return toast.promise(promise, messages)
  },
}

// The message an API route sent back, or the fallback for network failures and unexpected errors.
export function apiError(err: unknown, fallback: string): string {
  const fromResponse = (err as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error
  if (typeof fromResponse === "string" && fromResponse) return fromResponse
  return fallback
}

// A DELETE that survives the page being left, for commits deferred behind an Undo toast.
export function deleteKeepalive(url: string) {
  return fetch(url, { method: "DELETE", keepalive: true, credentials: "same-origin" }).then((res) => {
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
  })
}
