import useBuddyReads from "@/app/hooks/useBuddyReads"
import { askToUpgrade } from "@/app/hooks/useUpgradePrompt"
import { notify } from "@/lib/notify"

// Whether the reader can host another reading circle, for the ways into /circles/new (BOO-94): a reader at
// the free limit finds out at the button, from the Plus prompt, instead of shelving the book and landing on
// a form that refuses them. `refuse` says why: the Plus prompt when Plus lifts the limit, else the reason.
// Off (`enabled` false) for a signed-out visitor, who has nothing to look up.
export default function useHostingGate(enabled = true) {
  const { hosting } = useBuddyReads(enabled ? undefined : null)
  const blocked = !!hosting && !hosting.allowed
  const refuse = () => {
    if (hosting?.upgrade) askToUpgrade("canHostUnlimited")
    else notify.info(hosting?.message ?? "You can't start another reading circle right now.")
  }
  return { blocked, upgrade: blocked && !!hosting?.upgrade, message: hosting?.message ?? null, refuse }
}
