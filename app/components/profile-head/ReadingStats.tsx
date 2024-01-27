import { Book } from '@prisma/client'
import { FC } from 'react'

interface ReadingStatsProps {
  books: Book[]
}

const ReadingStats: FC<ReadingStatsProps> = ({books}) => {
  const bookCounts = {
    completed: 0,
    started: 0,
    notStarted: 0,
  };
  
  books.forEach((book) => {
    switch (book.status) {
      case "COMPLETED":
        bookCounts.completed++;
        break;
      case "STARTED":
        bookCounts.started++;
        break;
      default: // Assuming "NOT_STARTED" or other statuses
        bookCounts.notStarted++;
    }
  });
  return (
    <div className="flex gap-6 items-center mt-6 md:mt-0 px-6 md:self-end md:px-12">
      <div className="flex flex-col gap-1 items-start">
      <p className='text-xs'>Books</p>
      <h3 className="text-2xl font-bold">{books?.length}</h3>
      </div>
      <div className="h-10 w-[1px] bg-slate-400/50"></div>
      <div className="flex flex-col gap-1 items-start">
      <p className='text-xs'>Started</p>
      <h3 className="text-2xl font-bold">{bookCounts?.started}</h3>
      </div>
      <div className="h-10 w-[1px] bg-slate-400/50"></div>
      <div className="flex flex-col gap-1 items-start">
      <p className='text-xs'>Completed</p>
      <h3 className="text-2xl font-bold">{bookCounts?.completed}</h3>
      </div>
    </div>
  )
}

export default ReadingStats