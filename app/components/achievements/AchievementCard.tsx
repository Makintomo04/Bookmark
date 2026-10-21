"use client"
import { FC } from 'react'
import { getAchievementIcon } from './achievementIcons'
import { getCategoryTheme } from './achievementTheme'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import moment from 'moment'

interface AchievementCardProps {
  achievementKey: string;
  title: string;
  description: string;
  category?: string;
  earned: boolean;
  earnedAt?: string | null;
  progress?: { current: number; target: number } | null;
}

const AchievementCard: FC<AchievementCardProps> = ({ achievementKey, title, description, category, earned, earnedAt, progress }) => {
  const Icon = getAchievementIcon(achievementKey)
  const theme = getCategoryTheme(category ?? "")
  const percent = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-2xl border transition",
      earned ? "border-transparent bg-slate-50 dark:bg-slate-800/40" : "border-dashed border-slate-300 dark:border-slate-700"
    )}>
      <div className="relative flex-shrink-0">
        <div className={cn(
          "h-14 w-14 rounded-2xl flex items-center justify-center",
          earned
            ? cn("bg-gradient-to-br shadow-md ring-4 text-white", theme.gradient, theme.ring)
            : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600"
        )}>
          <Icon size={24}/>
        </div>
        {!earned && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border border-slate-300 dark:border-slate-700 flex items-center justify-center">
            <Lock size={10} className="text-slate-400"/>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-sm", !earned && "text-muted-foreground")}>{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {earned && earnedAt && (
          <p className="text-[11px] text-muted-foreground mt-1">Earned {moment(earnedAt).format("DD MMM YYYY")}</p>
        )}
        {!earned && progress && (
          <div className="mt-2 flex items-center gap-2">
            <progress className="h-[6px] rounded-full overflow-hidden flex-1 min-w-0" value={percent} max={100}>{percent}%</progress>
            <p className="text-[11px] text-muted-foreground flex-shrink-0">{progress.current}/{progress.target}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AchievementCard
