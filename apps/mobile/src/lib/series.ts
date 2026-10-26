import { mutate } from "swr";
import type { SeriesTrack } from "@bookmark/shared/series";
import { api } from "@/lib/api";

// Following a series and the series tracker (the web's lib/seriesFollows.ts and /api/series/*).

export const SERIES_TRACKER_KEY = "/api/series/tracker";
export const bookSeriesKey = (bookId: string) => `/api/books/${bookId}/series`;

export interface SeriesTracker {
  series: SeriesTrack[];
}

export interface BookSeries {
  series: { key: string; name: string; author: string; position: number | null; isFollowing: boolean } | null;
}

export interface AuthorSeries {
  key: string;
  name: string;
  author: string;
  count: number;
  isFollowing: boolean;
}

// Sets the follow rather than toggling it, so retrying after a dropped connection can't undo it. `also`
// is the screen's own SWR key, refreshed with the tracker.
export async function setFollowingSeries(series: { name: string; author: string }, following: boolean, also?: string) {
  const body = { name: series.name, author: series.author };
  if (following) await api.put("/api/series/follow", body);
  else await api.delete("/api/series/follow", body);
  await Promise.all([mutate(SERIES_TRACKER_KEY), also ? mutate(also) : null]);
}
