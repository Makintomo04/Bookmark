"use client"
import { FC } from 'react'
import { Check, Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import { SWATCHES } from '@/lib/profile'

interface ColourSwatchesProps {
  value: string
  onChange: (colour: string) => void
  labelledBy: string
  disabled?: boolean
}

// The preset colours plus a custom picker, as a radio group. Used by Edit Profile and onboarding.
const ColourSwatches: FC<ColourSwatchesProps> = ({ value, onChange, labelledBy, disabled }) => {
  const isCustom = !SWATCHES.includes(value.toUpperCase())
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {SWATCHES.map((swatch) => {
        const selected = value.toUpperCase() === swatch
        return (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={swatch}
            onClick={() => onChange(swatch)}
            disabled={disabled}
            className={cn(
              "grid size-9 place-items-center rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected && "ring-2 ring-offset-2 ring-offset-background ring-neutral-400 dark:ring-neutral-500"
            )}
            style={{ background: swatch, color: readableInk(swatch) }}
          >
            {selected && <Check size={16} strokeWidth={3} aria-hidden />}
          </button>
        )
      })}
      <label
        className={cn(
          "relative grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-neutral-400 transition hover:scale-110 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          isCustom && "border-solid border-transparent ring-2 ring-offset-2 ring-offset-background ring-neutral-400 dark:ring-neutral-500"
        )}
        style={isCustom ? { background: value, color: readableInk(value) } : undefined}
        title="Pick a custom colour"
      >
        <Pipette size={15} aria-hidden />
        <input
          type="color"
          aria-label="Custom colour"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

export default ColourSwatches
