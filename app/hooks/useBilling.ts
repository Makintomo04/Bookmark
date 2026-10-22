import { useState } from "react"
import axios from "axios"
import { notify, apiError } from "@/lib/notify"
import type { BillingInterval } from "@/lib/stripe"

// Sends the reader to Stripe: Checkout to start Plus, the customer portal to manage it.
// Both routes hand back a URL; the plan itself only changes when Stripe's webhook arrives.
export default function useBilling() {
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null)

  const go = async (kind: "checkout" | "portal", body?: object) => {
    setPending(kind)
    try {
      const { data } = await axios.post(`/api/billing/${kind}`, body ?? {})
      window.location.assign(data.url)
      // Leave `pending` set: the page is navigating away.
    } catch (err) {
      setPending(null)
      notify.error(apiError(err, kind === "checkout" ? "Couldn't open checkout. Try again." : "Couldn't open your subscription. Try again."))
    }
  }

  return {
    pending,
    startCheckout: (interval: BillingInterval) => go("checkout", { interval }),
    openPortal: () => go("portal"),
  }
}
