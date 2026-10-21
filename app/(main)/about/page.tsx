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
          <h1 className='text-4xl font-bold'>About Bookmark</h1>
          <p className='text-base text-slate-600 dark:text-gray-300/90'>
            Bookmark is a simple way to track what you read. Log a book, follow your progress page by page, rate and review it when you&apos;re done, and jot down notes or favourite quotes along the way — all without the clutter.
          </p>
          <p className='text-base text-slate-600 dark:text-gray-300/90'>
            Set a yearly reading goal and watch it fill up as you finish books. Follow other readers, see what&apos;s on their shelf, and share your own public profile with friends.
          </p>
          <p className='text-base text-slate-600 dark:text-gray-300/90'>
            It&apos;s built for readers who want a clean, focused place to keep track of their books — nothing more, nothing less.
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
