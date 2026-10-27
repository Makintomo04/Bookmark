import { useState } from "react"
import axios from "axios"
import { notify } from "@/lib/notify"
import { useSWRConfig } from "swr"
import useUser from "@/app/hooks/useUser"
import { privacyOf, type PrivacySettings } from "@/lib/privacyRules"
import { preferencesOf, type CommunityPreferences } from "@/lib/preferences"

export type Settings = PrivacySettings & CommunityPreferences & { favGenres: string[]; hideShelfPicks: boolean }

// The reader's privacy and community settings, each saved as soon as it changes (PATCH /api/user/privacy).
// Optimistic: the control moves straight away and rolls back if the save fails.
export default function useSettings() {
  const { user, mutate } = useUser()
  const { mutate: mutateAll } = useSWRConfig()
  const [pending, setPending] = useState<keyof Settings | null>(null)

  const settings: Settings | null = user
    ? { ...privacyOf(user), ...preferencesOf(user), favGenres: user.favGenres ?? [], hideShelfPicks: user.hideShelfPicks ?? false }
    : null

  const save = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!user) return
    setPending(key)
    mutate({ ...user, [key]: value }, { revalidate: false })
    axios.patch("/api/user/privacy", { [key]: value })
      .then((res) => {
        mutate({ ...user, ...res.data }, { revalidate: false })
        // Your own profile payload (counts, reviews) depends on these.
        mutateAll((k) => typeof k === "string" && k.startsWith("/api/users/") && !k.includes("/search"))
        if (key === "favGenres") mutateAll("/api/discover/for-you")
      })
      .catch(() => {
        mutate(user, { revalidate: false })
        notify.error("Couldn't save that setting.", { retry: () => save(key, value) })
      })
      .finally(() => setPending(null))
  }

  return { settings, save, pending }
}
