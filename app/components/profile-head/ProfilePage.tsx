"use client"
import { FC, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import useUser from '@/app/hooks/useUser'
import Loader from '../Loader'
import Container from '../Container'
import ProfileHead from './ProfileHead'
import BookList from '../books/BookList'
import PublicProfile from './PublicProfile'

interface ProfilePageProps {
  username: string
}

const ProfilePage: FC<ProfilePageProps> = ({ username }) => {
  const { status } = useSession()
  const { user, isLoading } = useUser()

  // Avoid flashing the public (read-only) view before we know whether this
  // is the signed-in user's own profile.
  if (status === "authenticated" && isLoading) {
    return (
      <div className="w-full h-full">
        <Loader />
      </div>
    )
  }

  const isSelf = status === "authenticated" && !!user && user.username === username

  if (isSelf) {
    return (
      <main className="pb-24 h-auto flex-grow min-h-[calc(100vh_-_180px)] bg-background">
        <Container>
          <Suspense fallback={<p>Loading...</p>}>
            <ProfileHead />
          </Suspense>

          <Suspense fallback={<p>Loading...</p>}>
            <BookList />
          </Suspense>
        </Container>
      </main>
    )
  }

  return (
    <div className='mt-12'>
      <Container>
        <PublicProfile username={username} />
      </Container>
    </div>
  )
}

export default ProfilePage
