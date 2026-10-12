import Container from '@/app/components/Container'
import PublicProfile from '@/app/components/profile-head/PublicProfile'
import { FC } from 'react'

interface PageProps {
  params: { username: string }
}

const Page: FC<PageProps> = ({ params }) => {
  return (
    <div className='mt-12'>
      <Container>
        <PublicProfile username={params.username} />
      </Container>
    </div>
  )
}

export default Page
