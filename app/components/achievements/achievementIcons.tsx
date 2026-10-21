import { BookOpen, Library, Trophy, Zap, Target, Flame, CalendarCheck, Quote, Star, Award } from 'lucide-react';
import { AchievementKey } from '@/lib/achievements-catalog';

export const ACHIEVEMENT_ICONS: Record<AchievementKey, typeof Award> = {
  FIRST_BOOKMARK: BookOpen,
  BOOKWORM: Library,
  BIBLIOPHILE: Trophy,
  PAGE_TURNER: Zap,
  GOAL_GETTER: Target,
  ON_A_ROLL: Flame,
  DEDICATED_READER: CalendarCheck,
  FIRST_IMPRESSION: Quote,
  CRITIC: Star,
};

export function getAchievementIcon(key: string) {
  return ACHIEVEMENT_ICONS[key as AchievementKey] ?? Award;
}
