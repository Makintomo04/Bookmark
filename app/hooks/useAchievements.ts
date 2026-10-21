import useSWR from "swr";

export default function useAchievements() {
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, isLoading, mutate } = useSWR("/api/achievements", fetcher);

  return {
    achievements: data ?? [],
    isLoading,
    isError: error,
    mutate,
  };
}
