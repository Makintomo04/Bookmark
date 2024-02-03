import useBooks from '@/app/hooks/useBooks';
import { Book } from '@prisma/client'
import { FC } from 'react'

interface ReadingStatsProps {
  
}

const ReadingStats: FC<ReadingStatsProps> = ({}) => {
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks} = useBooks();
  const bookCounts = {
    completed: 0,
    started: 0,
    notStarted: 0,
  };
  
  books?.forEach((book:Book) => {
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
  // if(!books) return (<p>No books</p>)
  return (
    <div className="flex self-start sm:self-auto gap-6 items-center jus md:mt-0 px-0 md:self-end">
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