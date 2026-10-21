import { FC } from 'react'
import { BookOpen, Flower2, Leaf, Moon, Mountain, Snowflake, Sparkles, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestMedalDesign } from '@/lib/questRules'
import { MEDAL_INK, shade } from './achievementTheme'

export const QUEST_ICON_COMPONENTS: Record<string, typeof Leaf> = {
  leaf: Leaf,
  snowflake: Snowflake,
  flower: Flower2,
  sun: Sun,
  mountain: Mountain,
  book: BookOpen,
  sparkles: Sparkles,
  moon: Moon,
}

interface QuestMedalProps {
  design: QuestMedalDesign
  earned: boolean
  className?: string
}

// A limited-edition medal: the ladder medal's round face in the quest's own colourway, a dashed inner
// ring and a star at the top for "limited", hanging from two notched ribbon tails like a rosette.
const QuestMedal: FC<QuestMedalProps> = ({ design, earned, className }) => {
  const Icon = QUEST_ICON_COMPONENTS[design.icon] ?? BookOpen
  const ribbonShade = shade(design.ribbon, 0.25)

  return (
    <div className={cn("relative aspect-[100/118]", !earned && "grayscale opacity-40", className)}>
      <svg viewBox="0 0 100 118" aria-hidden className="block h-full w-full">
        {/* Ribbon tails, behind the medal, each ending in a V notch. */}
        <path d="M30 62 L16 114 L25 107 L31 117 L46 66 Z" fill={design.ribbon} />
        <path d="M70 62 L84 114 L75 107 L69 117 L54 66 Z" fill={ribbonShade} />
        <circle cx="50" cy="50" r="50" fill={shade(design.colour)} />
        <circle cx="50" cy="50" r="44" fill={design.colour} />
        <circle cx="50" cy="50" r="37" fill="none" stroke={MEDAL_INK} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="3 3.2" />
        {/* The "limited" star, set into the rim. */}
        <path d="M50 1.5 L52.6 7 L58.5 7.6 L54 11.5 L55.4 17.3 L50 14.3 L44.6 17.3 L46 11.5 L41.5 7.6 L47.4 7 Z" fill={MEDAL_INK} />
      </svg>
      <div className="absolute left-[30%] top-[25.4%] w-[40%] aspect-square" aria-hidden>
        <Icon className="h-full w-full" strokeWidth={1.75} color={MEDAL_INK} />
      </div>
    </div>
  )
}

export default QuestMedal
