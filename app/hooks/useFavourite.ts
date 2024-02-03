import useSWR from "swr";

export default function useFavourite() {
  const fetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data, error, isLoading, mutate } = useSWR(`/api/favourites`, fetcher);

  const hasFavourited = (id:string) => {
    if(data?.favouriteIds?.includes(id)){
      return true
    }else{
      return false
    
    }
  }


  return {
    favourites: data?.favouriteIds || [],
    isLoading,
    isError: error,
    hasFavourited,
    mutate,
  };
}