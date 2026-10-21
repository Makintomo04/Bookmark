import { FC } from 'react'
import { cn } from '@/lib/utils'
import { getAchievementIcon } from './achievementIcons'
import { MEDAL_INK, getMedalColour, shade } from './achievementTheme'

interface MedalProps {
  achievementKey: string
  earned: boolean
  pill?: string
  pillClassName?: string
  className?: string
}

// The round medal itself, optionally with the number pill hanging off its bottom edge.
const Medal: FC<MedalProps> = ({ achievementKey, earned, pill, pillClassName, className }) => {
  const Icon = getAchievementIcon(achievementKey)
  const colour = getMedalColour(achievementKey)

  return (
    <div className={cn("relative", className)}>
      <div className={cn("relative aspect-square", !earned && "grayscale opacity-40")}>
        <svg viewBox="0 0 100 100" aria-hidden className="block h-full w-full">
          <circle cx="50" cy="50" r="50" fill={shade(colour)} />
          <circle cx="50" cy="50" r="44" fill={colour} />
          <circle cx="50" cy="50" r="36.5" fill="none" stroke={MEDAL_INK} strokeOpacity="0.45" strokeWidth="1.5" />
        </svg>
        <div className="absolute inset-[30%]" aria-hidden>
          <Icon className="h-full w-full" strokeWidth={1.75} color={MEDAL_INK} />
        </div>
      </div>
      {pill && (
        <span aria-hidden className={cn("absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", pillClassName ?? "bg-neutral-600 text-white")}>
          {pill}
        </span>
      )}
    </div>
  )
}

export default Medal
