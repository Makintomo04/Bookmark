import useSWR from "swr";
import { fetcher, swrOptions } from "@/lib/fetcher"

export interface MilestoneItem {
  value: number;
  title: string;
  description: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface AchievementItem {
  key: string;
  title: string;
  category: string;
  current: number;
  milestones: MilestoneItem[];
}

export default function useAchievements() {
  const { data, error, isLoading, mutate } = useSWR<AchievementItem[]>("/api/achievements", fetcher, swrOptions);

  return {
    achievements: data ?? [],
    isLoading,
    isError: error,
    mutate,
  };
}
