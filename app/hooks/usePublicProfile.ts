import useSWR from "swr";

export default function usePublicProfile(username: string) {
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, isLoading, mutate } = useSWR(
    username ? `/api/users/${encodeURIComponent(username)}` : null,
    fetcher
  );

  return {
    profile: data,
    isLoading,
    isError: error || data?.error,
    mutate,
  };
}
