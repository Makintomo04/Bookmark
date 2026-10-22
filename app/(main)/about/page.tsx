import Container from '@/app/components/Container'
import Link from 'next/link'
import { FC } from 'react'
import { Button } from '@/app/components/ui/button'

interface pageProps {

}

const Page: FC<pageProps> = ({}) => {
  return (
    <div className='py-16 md:py-20'>
      <Container>
        <div className='max-w-2xl mx-auto flex flex-col gap-6'>
          <h1 className='page-title'>About Bookmark</h1>
          <p className='text-base text-neutral-600 dark:text-neutral-300/90'>
            Bookmark is for reading with friends. Start a reading circle for a book, share one link, and talk about it as you go.
          </p>
          <p className='text-base text-neutral-600 dark:text-neutral-300/90'>
            Every comment is pinned to the point in the book where it was written, and stays hidden until you&apos;ve read that far. Read at your own pace, in any edition or on audio, without anyone spoiling the ending.
          </p>
          <p className='text-base text-neutral-600 dark:text-neutral-300/90'>
            Around that, Bookmark keeps track of everything you read: your progress, a yearly goal, and stats on your reading. Bring your history with you from Goodreads or StoryGraph, and take all of it with you whenever you like.
          </p>
          <Button asChild className='bg-brand-fill hover:bg-brand-fill-hover text-white px-6 py-6 text-base w-fit mt-2'>
            <Link href='/'>Back to Home</Link>
          </Button>
        </div>
      </Container>
    </div>
  )
}

export default Page
