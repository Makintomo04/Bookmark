"use client"
import { useParams } from 'next/navigation'
import Container from '@/app/components/Container'
import GenreHeader from '@/app/components/discover/GenreHeader'
import { GenreBooksSkeleton } from '@/app/components/discover/GenreBooks'
import { Skeleton } from '@/app/components/ui/skeleton'
import { genreBySlug } from '@/lib/genres'

// Shown the moment a genre tile is clicked, so the click registers straight away instead of
// Discover sitting still until the page is ready. Loading files don't get params, hence useParams.
export default function Loading() {
  const params = useParams<{ slug: string }>()
  const genre = genreBySlug(params?.slug ?? "")

  return (
    <div className="mt-6 sm:mt-8" aria-busy="true" aria-label="Loading genre">
      <Container className="flex flex-col gap-10">
        {genre ? <GenreHeader genre={genre} /> : <Skeleton className="mt-8 h-32 sm:h-40 rounded-2xl" />}
        <section>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-32" />
          <div className="mt-4"><GenreBooksSkeleton /></div>
        </section>
      </Container>
    </div>
  )
}
