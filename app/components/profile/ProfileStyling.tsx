"use client"
import { FC } from 'react'
import { Sparkles } from 'lucide-react'
import type { ProfileTheme } from '@prisma/client'
import { cn } from '@/lib/utils'
import { entitlementsOf } from '@/lib/entitlements'
import { PROFILE_THEMES } from '@/lib/personalisation'
import useUser from '@/app/hooks/useUser'
import ColourSwatches from './ColourSwatches'
import UpgradePrompt from '../plus/UpgradePrompt'
import { Segmented } from '../settings/controls'

const THEME_OPTIONS = PROFILE_THEMES.map((t) => ({ value: t.id, label: t.name }))

interface ProfileStylingProps {
  theme: ProfileTheme
  // #rrggbb, or null to follow the profile colour.
  shelfColour: string | null
  // The profile colour being edited, which the shelf follows when no shelf colour is set.
  profileColour: string
  onThemeChange: (theme: ProfileTheme) => void
  onShelfColourChange: (colour: string | null) => void
  disabled?: boolean
}

// The Plus looks for a profile, inside Edit profile. Controlled by the profile form, so they save with
// Save changes like everything else there; the server refuses (402) a free account, so this is not the gate.
const ProfileStyling: FC<ProfileStylingProps> = ({ theme, shelfColour, profileColour, onThemeChange, onShelfColourChange, disabled = false }) => {
  const { user } = useUser()
  if (!user) return null
  const { personalisation: canPersonalise } = entitlementsOf(user)
  const off = disabled || !canPersonalise

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Sparkles size={14} aria-hidden className="text-brand" /> Plus styling
      </p>
      <div className={cn("flex flex-col gap-5", !canPersonalise && "opacity-60")}>
        <div className="flex flex-col gap-1.5">
          <Segmented id="profile-theme" label="Profile theme" options={THEME_OPTIONS} value={canPersonalise ? theme : "CLASSIC"} onChange={onThemeChange} disabled={off} />
          <p className="text-xs text-muted-foreground">{PROFILE_THEMES.find((t) => t.id === theme)?.hint}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span id="profile-shelf-colour" className="text-sm font-medium">Shelf card colour</span>
          <p className="-mt-1 text-xs text-muted-foreground">Covers without art and progress bars on your shelf. Your profile colour stays as it is.</p>
          <ColourSwatches value={shelfColour ?? profileColour} onChange={onShelfColourChange} labelledBy="profile-shelf-colour" disabled={off} />
          {shelfColour && canPersonalise && (
            <button type="button" disabled={off} onClick={() => onShelfColourChange(null)} className="self-start text-xs font-medium underline-offset-4 hover:underline disabled:opacity-60">
              Use my profile colour
            </button>
          )}
        </div>
      </div>
      {!canPersonalise && <UpgradePrompt feature="personalisation" />}
    </div>
  )
}

export default ProfileStyling
