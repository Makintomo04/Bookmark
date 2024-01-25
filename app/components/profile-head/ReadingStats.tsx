import { FC } from 'react'

interface ReadingStatsProps {
  books: any
}

const ReadingStats: FC<ReadingStatsProps> = ({books}) => {
  return (
    <div className="flex gap-4 self-end">
      <div className="flex flex-col gap-1">
      <p className='text-xs'>Books</p>
      <h3 className="text-2xl font-semibold">{books?.length}</h3>
      </div>
    </div>
  )
}

export default ReadingStats