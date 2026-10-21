export const ACHIEVEMENTS = [
  { key: "FIRST_BOOKMARK", title: "First Bookmark", description: "Complete your first book", category: "reading" },
  { key: "BOOKWORM", title: "Bookworm", description: "Complete 10 books", category: "reading" },
  { key: "BIBLIOPHILE", title: "Bibliophile", description: "Complete 25 books", category: "reading" },
  { key: "PAGE_TURNER", title: "Page Turner", description: "Complete a book that's 500+ pages", category: "reading" },
  { key: "GOAL_GETTER", title: "Goal Getter", description: "Meet your reading goal for the year", category: "consistency" },
  { key: "ON_A_ROLL", title: "On a Roll", description: "Stay active for 3 days in a row", category: "consistency" },
  { key: "DEDICATED_READER", title: "Dedicated Reader", description: "Stay active for 7 days in a row", category: "consistency" },
  { key: "FIRST_IMPRESSION", title: "First Impression", description: "Write your first review", category: "engagement" },
  { key: "CRITIC", title: "Critic", description: "Rate 10 books", category: "engagement" },
] as const;

export type AchievementKey = typeof ACHIEVEMENTS[number]["key"];
export type AchievementDefinition = typeof ACHIEVEMENTS[number];

export function getAchievement(key: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}

export function getAchievementTitle(key: string): string {
  return getAchievement(key)?.title ?? "an achievement";
}
