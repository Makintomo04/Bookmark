"use client"
import { FC } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BANNER_PRESETS, BannerPresetId } from '@/lib/banners'
import BannerPattern from './BannerPattern'

interface BannerPresetPickerProps {
  // The chosen preset, or null when the banner is an uploaded photo.
  value: BannerPresetId | null
  colour: string
  onChange: (id: BannerPresetId) => void
  labelledBy: string
  disabled?: boolean
}

// Thumbnails of every preset, drawn live in the reader's colour, as a radio group. Used by Edit Profile and onboarding.
const BannerPresetPicker: FC<BannerPresetPickerProps> = ({ value, colour, onChange, labelledBy, disabled }) => (
  <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
    {BANNER_PRESETS.map((preset) => {
      const selected = value === preset.id
      return (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={preset.name}
          title={preset.name}
          onClick={() => onChange(preset.id)}
          disabled={disabled}
          className={cn(
            "relative h-11 overflow-hidden rounded-lg transition-[box-shadow,transform] hover:ring-2 hover:ring-offset-2 hover:ring-offset-background hover:ring-neutral-300 dark:hover:ring-neutral-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60",
            selected && "ring-2 ring-offset-2 ring-offset-background ring-neutral-400 dark:ring-neutral-500"
          )}
        >
          <BannerPattern preset={preset.id} colour={colour} />
          {selected && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-6 place-items-center rounded-full bg-black/55 text-white"><Check size={14} strokeWidth={3} aria-hidden /></span>
            </span>
          )}
        </button>
      )
    })}
  </div>
)

export default BannerPresetPicker
