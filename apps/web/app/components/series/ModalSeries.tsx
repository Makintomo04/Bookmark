"use client"
import { FC } from 'react'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { fetcher, swrOptions } from '@/lib/fetcher'
import type { SeriesTrack } from '@/lib/series'
import useUser from '@/app/hooks/useUser'
import SeriesSection from './SeriesSection'

// "In this series", as on the book page: the series' books in order, this one marked. Nothing when the
// book has no series in the catalog. Following a link in it closes the modal, as the title's link does.
const ModalSeries: FC<{ bookKey: string; onNavigate: () => void; compact?: boolean; headingClassName?: string }> = ({ bookKey, onNavigate, compact, headingClassName = "text-lg font-semibold" }) => {
  const { user } = useUser()
  const pathname = usePathname()
  const { data } = useSWR<{ series: { workId: string; position: number | null; track: SeriesTrack } | null }>(
    `/api/books/series?workKey=${encodeURIComponent(bookKey)}`, fetcher, swrOptions)
  const series = data?.series
  if (!series?.track.entries.length) return null
  return (
    <div onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onNavigate() }}>
      <SeriesSection
        track={series.track}
        workId={series.workId}
        position={series.position}
        signedIn={!!user?.id}
        returnTo={pathname ?? "/"}
        headingClassName={headingClassName}
        compact={compact}
      />
    </div>
  )
}

export default ModalSeries
