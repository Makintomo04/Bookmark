import Container from '@/app/components/Container'
import { Skeleton } from '@/app/components/ui/skeleton'

// Shaped like the profile header, so client-side navigation to a profile doesn't drop to the full-screen loader.
export default function Loading() {
  return (
    <div className="pt-4 pb-24 min-h-[calc(100vh_-_180px)] bg-background" aria-busy="true" aria-label="Loading profile">
      <Container>
        <Skeleton className="h-20 sm:h-28 w-full rounded-2xl" />
        <div className="px-4 sm:px-8">
          <Skeleton className="-mt-12 sm:-mt-14 size-24 sm:size-28 rounded-[32px] border-4 border-background" />
          <Skeleton className="mt-4 h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-[2/3] rounded-md" />)}
          </div>
        </div>
      </Container>
    </div>
  )
}
