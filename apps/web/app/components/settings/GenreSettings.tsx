"use client"
import { FC } from 'react'
import useSettings from '@/app/hooks/useSettings'
import { GenreChips, Toggle } from './controls'

// The genres picked in onboarding, which choose the genre picks (discover/GenrePicks.tsx) and the order of Discover's tiles.
const GenreSettings: FC = () => {
  const { settings, save, pending } = useSettings()
  if (!settings) return null

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-4">
      <div>
        <p id="settings-genres" className="text-sm font-medium">Your genres</p>
        <p className="text-xs text-muted-foreground">They come first on Discover, and decide which books we suggest to you.</p>
      </div>
      <GenreChips labelledBy="settings-genres" value={settings.favGenres} onChange={(v) => save("favGenres", v)} disabled={pending !== null} />
      <Toggle
        label="Suggest books on my shelf"
        hint="Popular books from your genres, at the top of your shelf until it holds a few books."
        checked={!settings.hideShelfPicks}
        onChange={(v) => save("hideShelfPicks", !v)}
        disabled={pending !== null}
      />
    </div>
  )
}

export default GenreSettings
