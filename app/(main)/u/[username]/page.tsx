import ProfilePage from '@/app/components/profile-head/ProfilePage'
import { FC } from 'react'

interface PageProps {
  params: { username: string }
}

const Page: FC<PageProps> = ({ params }) => {
  return <ProfilePage username={params.username} />
}

export default Page
