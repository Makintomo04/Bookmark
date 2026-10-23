import useSWR from "swr";
import { fetcher, swrOptions } from "@/lib/fetcher"

export default function useFavourite() {
  const { data, error, isLoading, mutate } = useSWR(`/api/favourites`, fetcher, swrOptions);

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