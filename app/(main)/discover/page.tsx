import Container from '@/app/components/Container'
import DiscoverUsers from '@/app/components/profile-head/DiscoverUsers'
import { FC } from 'react'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
  return <div className='mt-12'>
    <Container>
      <h1 className='text-4xl font-bold mb-6'>Discover</h1>
      <DiscoverUsers />
    </Container>
  </div>
}

export default Page
