import Link from 'next/link'
import Container from '@/app/components/Container'
import { secondaryButtonClass } from '@/app/components/profile-head/ProfileHeader'

export default function NotFound() {
  return (
    <div className="py-24">
      <Container>
        <div className="max-w-md mx-auto text-center">
          <h1 className="page-title">This reader couldn&apos;t be found</h1>
          <p className="mt-2 text-sm text-muted-foreground">The username may have changed, or the account no longer exists.</p>
          <Link href="/discover" className={`${secondaryButtonClass} mt-6`}>Discover readers</Link>
        </div>
      </Container>
    </div>
  )
}
