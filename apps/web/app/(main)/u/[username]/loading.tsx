import Container from '@/app/components/Container'
import ProfileSkeleton from '@/app/components/profile-head/ProfileSkeleton'

// Shaped like the profile, so client-side navigation to one doesn't drop to the full-screen loader. It doesn't
// know whose profile it is yet, so it's the shape of someone else's.
export default function Loading() {
  return (
    <div className="pt-4 pb-24 min-h-[calc(100vh_-_180px)] bg-background">
      <Container>
        <ProfileSkeleton />
      </Container>
    </div>
  )
}
