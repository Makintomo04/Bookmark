import useSWR from "swr";
import { fetcher, swrOptions } from "@/lib/fetcher"
import { publicProfileKey } from "@/lib/profileKey"

export default function usePublicProfile(username: string, options?: { books?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(
    username ? publicProfileKey(username, options) : null,
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
