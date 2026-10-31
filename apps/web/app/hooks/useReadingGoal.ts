import useSWR from "swr";
import type { ReadingGoal } from "@prisma/client";
import type { GoalProgress } from "@/lib/goals";
import { fetcher, swrOptions } from "@/lib/fetcher"

// The year's goal and the progress toward it, in one request. Refreshed by refreshAfterBookChange (its key
// starts /api/reading-goal).
export default function useReadingGoal(year: number = new Date().getFullYear()) {
  const { data, error, isLoading, mutate } = useSWR<{ goal: ReadingGoal | null; progress: GoalProgress & { beforeGoal?: number } }>(`/api/reading-goal/summary?year=${year}`, fetcher, swrOptions);

  return {
    goal: data?.goal,
    progress: data?.progress,
    isLoading,
    isError: error,
    mutate,
  };
}
