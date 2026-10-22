import useSWR from "swr";
import type { GoalProgress } from "@/lib/goals";
import { fetcher, swrOptions } from "@/lib/fetcher"

// Refreshed with the goal itself by refreshAfterBookChange (its key starts /api/reading-goal).
export default function useGoalProgress(year: number = new Date().getFullYear()) {
  const { data, error, isLoading } = useSWR<GoalProgress>(`/api/reading-goal/progress?year=${year}`, fetcher, swrOptions);

  return {
    progress: data,
    isLoading,
    isError: error,
  };
}
