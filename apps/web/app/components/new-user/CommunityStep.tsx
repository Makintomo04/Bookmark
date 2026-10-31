"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { Button } from '@/app/components/ui/button'
import useUser from '@/app/hooks/useUser'
import useSettings, { type Settings } from '@/app/hooks/useSettings'
import { GenreChips, PROFILE_HINT, PROFILE_OPTIONS, Segmented } from '@/app/components/settings/controls'

// Onboarding's middle step: favourite genres and who can see the profile. The other privacy and invite
// settings wait for Edit profile, when the reader has seen what they're about. Unlike the settings panel
// this keeps a draft and saves it once on Continue; skipping keeps the defaults.
const CommunityStep: FC<{ onDone: () => void }> = ({ onDone }) => {
  const { mutate } = useUser()
  const { settings } = useSettings()
  const [draft, setDraft] = useState<Settings | null>(settings)
  const [saving, setSaving] = useState(false)
  if (!draft) return null

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value })

  const submit = async () => {
    setSaving(true)
    try {
      const res = await axios.patch("/api/user/privacy", draft)
      mutate((user: object | undefined) => user && { ...user, ...res.data }, { revalidate: false })
      onDone()
    } catch {
      notify.error("Couldn't save your choices.", { description: "Try again, or skip for now.", retry: submit })
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="page-title">What do you like to read?</h1>
        <p className="mt-2 text-sm text-muted-foreground">We&apos;ll use this to suggest books to start your shelf. Everything else starts on sensible defaults you can change in Settings.</p>
      </div>

      <section aria-labelledby="genres-label" className="flex flex-col gap-2">
        <h2 id="genres-label" className="text-sm font-medium">Genres you love</h2>
        <p className="-mt-1 text-xs text-muted-foreground">Pick as many as you like.</p>
        <div className="mt-1">
          <GenreChips labelledBy="genres-label" value={draft.favGenres} onChange={(v) => set("favGenres", v)} disabled={saving} />
        </div>
      </section>

      <div className="flex flex-col gap-1.5">
        <Segmented id="onboarding-profile" label="Who can see your profile" options={PROFILE_OPTIONS} value={draft.profileVisibility} onChange={(v) => set("profileVisibility", v)} disabled={saving} />
        <p className="text-xs text-muted-foreground">{PROFILE_HINT[draft.profileVisibility]}</p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" onClick={onDone} disabled={saving} variant="outline" className="rounded-md py-2 dark:border-neutral-100/50">
          Skip
        </Button>
        <Button type="button" onClick={submit} loading={saving} className="rounded-md py-2">
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  )
}

export default CommunityStep
