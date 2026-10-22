"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Check } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import useUser from '@/app/hooks/useUser'
import useSettings, { type Settings } from '@/app/hooks/useSettings'
import { GENRES } from '@/lib/genres'
import { cn } from '@/lib/utils'
import { INVITE_HINT, INVITE_OPTIONS, LIST_OPTIONS, PROFILE_HINT, PROFILE_OPTIONS, REVIEW_OPTIONS, Segmented, Toggle } from '@/app/components/settings/controls'

// Onboarding's middle step: who sees what, and how other readers can reach you. Unlike the settings
// panel this keeps a draft and saves it once on Continue; skipping keeps the defaults.
const CommunityStep: FC<{ onDone: () => void }> = ({ onDone }) => {
  const { mutate } = useUser()
  const { settings } = useSettings()
  const [draft, setDraft] = useState<Settings | null>(settings)
  const [saving, setSaving] = useState(false)
  if (!draft) return null

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value })
  const toggleGenre = (slug: string) =>
    set("favGenres", draft.favGenres.includes(slug) ? draft.favGenres.filter((g) => g !== slug) : [...draft.favGenres, slug])

  const submit = async () => {
    setSaving(true)
    try {
      const res = await axios.patch("/api/user/privacy", draft)
      mutate((user: object | undefined) => user && { ...user, ...res.data }, { revalidate: false })
      onDone()
    } catch {
      toast.error("Couldn't save your choices. Try again, or skip for now.", { position: "bottom-center" })
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Your reading community</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose what other readers see and how they can reach you. You can change any of this later in Edit profile.</p>
      </div>

      <section aria-labelledby="genres-label" className="flex flex-col gap-2">
        <h2 id="genres-label" className="text-sm font-medium">Genres you love</h2>
        <p className="-mt-1 text-xs text-muted-foreground">Pick as many as you like.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {GENRES.map((genre) => {
            const on = draft.favGenres.includes(genre.slug)
            return (
              <button
                key={genre.slug}
                type="button"
                aria-pressed={on}
                disabled={saving}
                onClick={() => toggleGenre(genre.slug)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  on ? "border-red-500 bg-red-500 text-white" : "border-neutral-300 bg-background hover:border-red-400 dark:border-neutral-700"
                )}
              >
                {on && <Check size={14} aria-hidden />}
                {genre.label}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-label="Privacy" className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-background p-4 dark:border-neutral-800">
        <div className="flex flex-col gap-1.5">
          <Segmented id="onboarding-profile" label="Who can see your profile" options={PROFILE_OPTIONS} value={draft.profileVisibility} onChange={(v) => set("profileVisibility", v)} disabled={saving} />
          <p className="text-xs text-muted-foreground">{PROFILE_HINT[draft.profileVisibility]}</p>
        </div>
        <Segmented id="onboarding-reviews" label="Who can read your reviews" options={REVIEW_OPTIONS} value={draft.reviewVisibility} onChange={(v) => set("reviewVisibility", v)} disabled={saving} />
        <Toggle
          label="Hide my Want to read shelf"
          hint="Others won't see what's on your list, or when you add to it."
          checked={draft.hideWantToRead}
          onChange={(v) => set("hideWantToRead", v)}
          disabled={saving}
        />
        <Toggle
          label="Hide follower and following counts"
          hint="No numbers on your profile, for you or anyone else."
          checked={draft.hideFollowCounts}
          onChange={(v) => set("hideFollowCounts", v)}
          disabled={saving}
        />
      </section>

      <section aria-label="Reading with others" className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-background p-4 dark:border-neutral-800">
        <div className="flex flex-col gap-1.5">
          <Segmented id="onboarding-invites" label="Who can invite you to buddy reads" options={INVITE_OPTIONS} value={draft.buddyReadInvites} onChange={(v) => set("buddyReadInvites", v)} disabled={saving} />
          <p className="text-xs text-muted-foreground">{INVITE_HINT[draft.buddyReadInvites]} An invite link always works.</p>
        </div>
        <Segmented id="onboarding-lists" label="New lists start as" options={LIST_OPTIONS} value={draft.defaultListVisibility} onChange={(v) => set("defaultListVisibility", v)} disabled={saving} />
        <Toggle
          label="Show spoilers in reviews"
          hint="Reviews marked as spoilers open straight away instead of staying covered."
          checked={draft.showSpoilers}
          onChange={(v) => set("showSpoilers", v)}
          disabled={saving}
        />
      </section>

      <div className="flex flex-col gap-2">
        <Button type="button" onClick={submit} disabled={saving} className="bg-red-500 text-white hover:bg-red-600 rounded-md py-2">
          {saving ? "Saving…" : "Continue"}
        </Button>
        <Button type="button" onClick={onDone} disabled={saving} variant="ghost" className="rounded-md py-2 text-muted-foreground">
          Skip for now
        </Button>
      </div>
    </div>
  )
}

export default CommunityStep
