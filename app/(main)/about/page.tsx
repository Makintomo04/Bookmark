import Container from '@/app/components/Container'
import Link from 'next/link'
import { FC } from 'react'

interface pageProps {
  
}

const page: FC<pageProps> = ({}) => {
  return <div>
    <Container>
   <h1 className='text-4xl font-bold'>About</h1>
<Link href="/">Home</Link>
    </Container>

  </div>
}

export default page