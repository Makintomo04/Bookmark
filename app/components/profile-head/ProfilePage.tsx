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

  return (
    <div className="pt-4 pb-24 min-h-[calc(100vh_-_180px)] bg-background">
      <Container>
        {isSelf ? (
          <>
            <Suspense fallback={<p>Loading...</p>}>
              <ProfileHead />
            </Suspense>
            <div className="mt-12 px-4 sm:px-8">
              <Suspense fallback={<p>Loading...</p>}>
                <BookList />
              </Suspense>
            </div>
          </>
        ) : (
          <PublicProfile username={username} />
        )}
      </Container>
    </div>
  )
}

export default ProfilePage
