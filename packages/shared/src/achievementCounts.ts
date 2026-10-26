// The quiet line of counts under the reader's tier: medals earned across every ladder, ladders under
// way, and ladders not started. Pure, so web and mobile say the same thing and
// scripts/test/achievementCounts.test.ts runs it.

type Ladder = { milestones: { earned: boolean }[] }

export interface AchievementCounts {
  // Rungs earned across all ladders.
  earned: number
  // Ladders with some rungs earned but not all.
  inProgress: number
  // Ladders with no rungs earned.
  notStarted: number
}

export function achievementCounts(ladders: Ladder[]): AchievementCounts {
  const counts = { earned: 0, inProgress: 0, notStarted: 0 }
  for (const { milestones } of ladders) {
    if (milestones.length === 0) continue
    const earned = milestones.filter((m) => m.earned).length
    counts.earned += earned
    if (earned === 0) counts.notStarted++
    else if (earned < milestones.length) counts.inProgress++
  }
  return counts
}

const fmt = (n: number) => n.toLocaleString("en-GB")

// "14 medals earned · 5 in progress · 3 not started". Empty parts drop out, and before the first medal
// the line leads with "No medals yet" rather than a bare zero.
export function achievementCountsLine({ earned, inProgress, notStarted }: AchievementCounts): string {
  const parts = [earned === 0 ? "No medals yet" : `${fmt(earned)} ${earned === 1 ? "medal" : "medals"} earned`]
  if (inProgress > 0) parts.push(`${fmt(inProgress)} in progress`)
  if (notStarted > 0) parts.push(`${fmt(notStarted)} not started`)
  return parts.join(" · ")
}
