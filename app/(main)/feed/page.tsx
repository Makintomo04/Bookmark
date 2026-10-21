import Container from '@/app/components/Container'
import ActivityFeed from '@/app/components/feed/ActivityFeed'
import { FC } from 'react'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
  return <div className='mt-12'>
    <Container>
      <h1 className='text-4xl font-bold mb-6'>Feed</h1>
      <ActivityFeed />
    </Container>
  </div>
}

export default Page
