"use client"
import { FC } from 'react'
import { Status, type Book } from '@prisma/client';
import moment from 'moment'
import Image from 'next/image';
import { TbBook, TbBook2 } from "react-icons/tb";
import { Check, Quote } from 'lucide-react';
import { IoIosStar } from "react-icons/io";
import { calculatePercentageComplete } from '@/utils/helpers';

interface PublicBookCardProps {
  book: Book
}

const PublicBookCard: FC<PublicBookCardProps> = ({ book }) => {
  const { title, author, coverImage, pages, currentPage, startedAt, status, cardColour, rating, genre, review } = book

  return (
    <div style={{ background: `${cardColour}` }} className="h-[350px] w-full xl:w-[275px] overflow-hidden rounded-[20px] p-6 relative">
      {status === Status.COMPLETED && (
        <div className="absolute flex justify-center items-center bottom-0 h-24 w-full bg-slate-300/60 dark:bg-slate-900/60 pointer-events-none z-10 left-0">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex justify-center items-center shadow-md drop-shadow-lg ">
            <Check size={30} className='text-slate-800 ' />
          </div>
        </div>
      )}
      <div className="overflow-hidden max-w-52">
        <h2 className='leading-none font-bold text-[26px] max-w-[190px] text-white mb-2 truncate'>{title}</h2>
      </div>
      <div className="flex gap-4 items-center">
        <p className='font-medium text-[16px] text-white'>{author}</p>
        {rating && <div className="flex gap-1 items-center">
          <IoIosStar color='white' size={16}/>
          <p className='font-semibold text-white text-[16px]'>{rating}</p>
        </div>}
        {review && <Quote size={14} color='white' className='opacity-80' aria-label="Has a review"/>}
      </div>
      {genre && <p className='inline-block mt-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-medium w-fit'>{genre}</p>}
      {status === Status.STARTED ? (
        <div className="flex gap-2 items-center mt-4">
          <TbBook color='white' size={16} />
          <p className='font-medium uppercase text-slate-100 text-xs'>Started On {moment(new Date(startedAt!)).format('DD/MM/YYYY')}</p>
        </div>
      ) : status === Status.COMPLETED ? (
        <div className="flex gap-2 items-center mt-4">
          <Check color='white' size={16} />
          <p className='font-medium uppercase text-slate-100 text-sm'>Completed</p>
        </div>
      ) : null}
      {status === Status.STARTED && (
        <div className="my-4 flex gap-2 items-center w-full">
          <progress style={{ color: "#be1e2d" }} className='h-[8px] rounded-full overflow-hidden' value={currentPage!} max={pages}>{calculatePercentageComplete(pages, currentPage!)}%</progress>
          <p className='font-semibold text-white'>{calculatePercentageComplete(pages, currentPage!)}%</p>
        </div>
      )}
      <div className="h-full w-[calc(100%_-_48px)] absolute -bottom-48 top-auto">
        {coverImage ? <Image src={coverImage} alt="" layout="fill" objectFit="cover" className='w-full h-full rounded-[20px] mt-4' /> : <div style={{ background: `${cardColour}` }} className="w-full h-full rounded-[20px] mt-4"></div>}
      </div>
    </div>
  )
}

export default PublicBookCard
