import useSWR from "swr";

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
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, isLoading, mutate } = useSWR<AchievementItem[]>("/api/achievements", fetcher);

  return {
    achievements: data ?? [],
    isLoading,
    isError: error,
    mutate,
  };
}
