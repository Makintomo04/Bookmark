import { useState } from "react"
import axios from "axios"
import useSWR from "swr"
import { apiError, notify } from "@/lib/notify"
import { withChange, type NotificationChange, type NotificationSettings } from "@bookmark/shared/reminders"

export type { NotificationChange, NotificationSettings } from "@bookmark/shared/reminders"

const fetcher = (url: string) => axios.get<NotificationSettings>(url).then((r) => r.data)

// Push, reminder and email settings (GET and PATCH /api/push/settings), for Settings and the reminders
// sheet. Optimistic: a control moves straight away and rolls back, saying why, if the save is refused.
// `enabled` false waits: the reminders sheet only loads them once it has something to ask.
export default function useNotificationSettings(enabled = true) {
  const { data, mutate } = useSWR(enabled ? "/api/push/settings" : null, fetcher)
  const [pending, setPending] = useState(false)

  const save = async (change: NotificationChange): Promise<boolean> => {
    if (!data) return false
    setPending(true)
    mutate(withChange(data, change), { revalidate: false })
    try {
      const res = await axios.patch<NotificationSettings>("/api/push/settings", change)
      mutate(res.data, { revalidate: false })
      return true
    } catch (error) {
      mutate(data, { revalidate: false })
      notify.error(apiError(error, "Couldn't save that setting."))
      return false
    } finally {
      setPending(false)
    }
  }

  return { settings: data ?? null, save, pending }
}
