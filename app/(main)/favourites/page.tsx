import Container from '@/app/components/Container'
import FavBookList from '@/app/components/books/FavBookList'
import useBooks from '@/app/hooks/useBooks'
import { Book } from 'lucide-react'
import Link from 'next/link'
import { FC } from 'react'

interface pageProps {
  
}

const Page: FC<pageProps> = ({}) => {
  // const {books, isLoading, isError} = useBooks()
  return <div className='mt-12'>
    <Container>
{/* <Link href="/">Home</Link> */}
   <h1 className='text-4xl font-bold'>Favourites</h1>
   <div className="mt-6">
    <FavBookList/>
    </div>
    </Container>

  </div>
}

export default Page