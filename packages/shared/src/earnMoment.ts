import { closestMilestones, getAchievement, milestoneKey, toNextText } from "./achievements-catalog";
import { READER_TIERS } from "./readerTier";

// What a save just earned, for the app to celebrate there and then: new medals, a new reader tier, and
// (when a book was finished) where the reader now stands on their goal and the nearest next medal.
// Pure, so web and mobile read the same shape and scripts/test/earnMoment.test.ts runs it.

export interface EarnedMedal {
  // The ladder ("BOOKS_READ") and the rung's stored key ("BOOKS_READ:50").
  achievementKey: string;
  key: string;
  // The rung's name ("Book Devourer"), the ladder's ("Books read"), the rung's number and what it asked.
  title: string;
  achievementTitle: string;
  value: number;
  description: string;
}

export interface EarnMoment {
  medals: EarnedMedal[];
  // The reader tier just reached. Tiers land on Books read rungs, so a tier-up always comes with a medal.
  tier: { key: string; label: string } | null;
  // This year's goal after a finish, when one is set.
  goal: { year: number; books: number; target: number } | null;
  // The nearest medal still to earn, in plain words ("6 more books").
  next: { title: string; achievementTitle: string; text: string } | null;
}

export interface EarnMomentInput {
  awarded: { achievementKey: string; value: number }[];
  // Ladder numbers the save worked out (only the ladders it could move).
  stats: Partial<Record<string, number>>;
  // Every rung the reader holds now, as stored keys.
  earnedKeys: Iterable<string>;
  goal?: { year: number; books: number; target: number } | null;
  // Only a finished book asks "what's next"; a page update or a rating stays quiet unless it earned something.
  finished?: boolean;
}

export function buildEarnMoment({ awarded, stats, earnedKeys, goal = null, finished = false }: EarnMomentInput): EarnMoment {
  const medals = awarded.flatMap(({ achievementKey, value }) => {
    const achievement = getAchievement(achievementKey);
    const milestone = achievement?.milestones.find((m) => m.value === value);
    if (!achievement || !milestone) return [];
    return [{ achievementKey, key: milestoneKey(achievement.key, value), title: milestone.title, achievementTitle: achievement.title, value, description: achievement.describe(value) }];
  });

  const booksRungs = medals.filter((m) => m.achievementKey === "BOOKS_READ").map((m) => m.value);
  const reached = READER_TIERS.filter((t) => booksRungs.includes(t.minBooks));
  const top = reached[reached.length - 1];
  const tier = top ? { key: top.key, label: top.label } : null;

  let next: EarnMoment["next"] = null;
  if (finished) {
    const held = new Set(earnedKeys);
    const ladders = Object.entries(stats).flatMap(([key, current]) => {
      const achievement = getAchievement(key);
      if (!achievement || current === undefined) return [];
      return [{ key, title: achievement.title, current, milestones: achievement.milestones.map((m) => ({ ...m, earned: held.has(milestoneKey(achievement.key, m.value)) })) }];
    });
    const [closest] = closestMilestones(ladders, 1);
    if (closest) next = { title: closest.next.title, achievementTitle: closest.ladder.title, text: toNextText(closest.ladder.key, closest.ladder.current, closest.next.value) };
  }

  return { medals, tier, goal: finished ? goal : null, next };
}

// Whether there's anything worth showing at all.
export const hasEarnMoment = (m: EarnMoment | null | undefined): m is EarnMoment => !!m && (m.medals.length > 0 || !!m.goal || !!m.next);

// The one line under "Marked as finished": "18 of 52 books in 2026 · 6 more books to Book Devourer". A medal
// that isn't counted up says what to do instead: "Complete a book that's 1,000+ pages to earn Tome Raider".
export function finishLine(m: EarnMoment): string | null {
  const parts: string[] = [];
  if (m.goal) parts.push(`${m.goal.books} of ${m.goal.target} books in ${m.goal.year}`);
  if (m.next) parts.push(`${m.next.text} ${/^[\d,]+ more /.test(m.next.text) ? "to" : "to earn"} ${m.next.title}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
