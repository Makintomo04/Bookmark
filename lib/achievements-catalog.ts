// `threshold` is the number a badge is earned at; it also labels the badge.
// GOAL_GETTER has none because its target is the reader's own yearly goal.
export const ACHIEVEMENTS = [
  { key: "FIRST_BOOKMARK", title: "First Bookmark", description: "Complete your first book", category: "reading", threshold: 1 },
  { key: "BOOKWORM", title: "Bookworm", description: "Complete 10 books", category: "reading", threshold: 10 },
  { key: "BIBLIOPHILE", title: "Bibliophile", description: "Complete 25 books", category: "reading", threshold: 25 },
  { key: "PAGE_TURNER", title: "Page Turner", description: "Complete a book that's 500+ pages", category: "reading", threshold: 500 },
  { key: "GOAL_GETTER", title: "Goal Getter", description: "Meet your reading goal for the year", category: "consistency", threshold: null },
  { key: "ON_A_ROLL", title: "On a Roll", description: "Stay active for 3 days in a row", category: "consistency", threshold: 3 },
  { key: "DEDICATED_READER", title: "Dedicated Reader", description: "Stay active for 7 days in a row", category: "consistency", threshold: 7 },
  { key: "FIRST_IMPRESSION", title: "First Impression", description: "Write your first review", category: "engagement", threshold: 1 },
  { key: "CRITIC", title: "Critic", description: "Rate 10 books", category: "engagement", threshold: 10 },
] as const;

export type AchievementKey = typeof ACHIEVEMENTS[number]["key"];
export type AchievementDefinition = typeof ACHIEVEMENTS[number];

export function getAchievement(key: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}

export function getAchievementTitle(key: string): string {
  return getAchievement(key)?.title ?? "an achievement";
}

export function getThreshold(key: AchievementKey): number {
  return getAchievement(key)?.threshold ?? 0;
}
