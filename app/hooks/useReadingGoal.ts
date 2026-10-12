import useSWR from "swr";

export default function useReadingGoal(year: number = new Date().getFullYear()) {
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, isLoading, mutate } = useSWR(`/api/reading-goal?year=${year}`, fetcher);

  return {
    goal: data,
    isLoading,
    isError: error,
    mutate,
  };
}
