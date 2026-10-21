import { Library, ScrollText, Mountain, Flame, Target, Quote, Star, Award } from 'lucide-react';
import { AchievementKey } from '@/lib/achievements-catalog';

export const ACHIEVEMENT_ICONS: Record<AchievementKey, typeof Award> = {
  BOOKS_READ: Library,
  PAGES_READ: ScrollText,
  BIG_BOOKS: Mountain,
  STREAK: Flame,
  GOALS: Target,
  REVIEWS: Quote,
  RATINGS: Star,
};

export function getAchievementIcon(key: string) {
  return ACHIEVEMENT_ICONS[key as AchievementKey] ?? Award;
}
