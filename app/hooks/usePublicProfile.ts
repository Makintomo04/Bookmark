import useSWR from "swr";
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function usePublicProfile(username: string) {
  const { data, error, isLoading, mutate } = useSWR(
    username ? `/api/users/${encodeURIComponent(username)}` : null,
    fetcher,
    swrOptions
  );

  return {
    profile: data,
    isLoading,
    isError: error || data?.error,
    mutate,
  };
}
