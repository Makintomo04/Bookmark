'use client' // Error components must be Client Components
 
import { useEffect } from 'react'
import Container from '../components/Container'
import { Button } from '../components/ui/button'
 
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])
 
  return (
        <div className='h-full w-full '>
    <Container className="h-full">
      <div className="flex flex-col gap-5 items-center justify-center h-full w-full">
      <h2 className='text-4xl font-bold'>Something went wrong!</h2>
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Try again
      </Button>
      </div>
      </Container>
    </div>
  )
}