import useSWR from "swr";
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useReadingGoal(year: number = new Date().getFullYear()) {
  const { data, error, isLoading, mutate } = useSWR(`/api/reading-goal?year=${year}`, fetcher, swrOptions);

  return {
    goal: data,
    isLoading,
    isError: error,
    mutate,
  };
}
