"use client"
import { FC, useRef, useState } from 'react'
import { Status, type Book } from '@prisma/client';
import { IoIosStar } from "react-icons/io";
import { FaRegCalendar } from "react-icons/fa6";
import moment from 'moment'
import Image from 'next/image';
import randomColor from 'randomcolor';
import {motion,cubicBezier} from 'framer-motion';
import { FiBook,FiBookOpen  } from "react-icons/fi";
import { TbBook,TbBook2  } from "react-icons/tb";
import useUser from '@/app/hooks/useUser';
import Marquee from '../Marquee';
import { Check, Quote } from 'lucide-react';
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal';
import { calculatePercentageComplete } from '@/utils/helpers';
import useFavourite from '@/app/hooks/useFavourite';
import axios from 'axios';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import EditButton from '../profile-head/EditButton';
import CardMenu from './CardMenu';
import useBooks from '@/app/hooks/useBooks';
import useBookEditModal from '@/app/hooks/useBookEditModal';
import useBookNotesModal from '@/app/hooks/useBookNotesModal';
interface BookCardProps {
  book: Book
}

const BookCard: FC<BookCardProps> = ({book}) => {
  var color = randomColor();
  const {title, author, coverImage, description, pages,currentPage,startedAt,status,cardColour,rating,genre,review} = book
  const {user,isLoading,isError,mutate} = useUser();
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks,mutate:booksMutate} = useBooks();
  const {favourites,hasFavourited, isLoading:isFavLoading,isError:isFavError,mutate:mutateFav} = useFavourite();
  const bookUpdateModal = useBookUpdateModal()
  const [bookId, setBookId] = useState<string>("")

  const [isOpen, setIsOpen] = useState(false);
  let ref = useRef(null);
  const variants = {
    open: { opacity: 1, y: -180,scale:1.25 },
    closed: { opacity: 1, y: 0 },
  }
  const easing = cubicBezier(.35,.17,.3,.86)
  const isLongTitle = title.length > 15;
  const handleOpenBookModal = () => {
    setBookId(book.id)
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === Status.COMPLETED ? true : false)
    bookUpdateModal.onOpen(book.id)
  }
  const handleCoverImageClick = (e:React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      setIsOpen(isOpen => !isOpen)
 
  }
  const handleFavClick = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    axios.post(`/api/favourites/${book.id}`).then((res) => {
      if(!hasFavourited(book.id)){
      toast.success("Added to Favourites!",{ position: "bottom-center" })
      }
      else{
        toast.success("Removed from Favourites!",{ position: "bottom-center" })
      }
    }).catch((err) => {
      toast.error("Error Adding to Favourites!",{ position: "bottom-center" })
    }).finally(() => {
      mutateFav()
      mutate()
    })
  }
  const [isEditOpen, setIsEditOpen] = useState(false)
  const bookEditModal = useBookEditModal()

  const handleEditClick = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setIsEditOpen(isEditOpen => !isEditOpen)
  }

  const handleEditDetails = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setIsEditOpen(false)
    bookEditModal.onOpen(book)
  }

  const bookNotesModal = useBookNotesModal()
  const handleNotesClick = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setIsEditOpen(false)
    bookNotesModal.onOpen(book.id, book.title)
  }

  const handleRemove = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    axios.delete(`/api/books/${book.id}`).then((res) => {
      toast.success("Book Removed!",{ position: "bottom-center" })
    }).catch((err) => {
      toast.error("Something went wrong!!",{ position: "bottom-center" })
    }).finally(() => {
      booksMutate()
      mutateFav()
    })
  }
  
  return (
    <div style={{background:`${cardColour}`}} onClick={handleOpenBookModal} className={cn("",`cursor-pointer h-[350px] w-full xl:w-[275px] overflow-hidden rounded-[20px] p-6 relative`)}>
      {isEditOpen && <CardMenu onRemove={(e)=>handleRemove(e)} onEdit={(e)=>handleEditDetails(e)} onNotes={(e)=>handleNotesClick(e)}/>}
      {status === Status.COMPLETED && (
        <div className="absolute flex justify-center items-center bottom-0 h-24 w-full bg-slate-300/60 dark:bg-slate-900/60 pointer-events-none z-10 left-0">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex justify-center items-center shadow-md drop-shadow-lg ">
            <Check size={30} className='text-slate-800 '/>
          </div>
        </div>
        )}
        <EditButton handleClick={handleEditClick} className='absolute top-12 right-[10px]'/>
      <div className="absolute top-4 right-4 z-10">
        <div onClick={handleFavClick}className="h-5 w-5 relative cursor-pointer " >
        {hasFavourited(book.id) ? <Image src="/images/bookmark_active.svg" alt="" fill  className="w-full h-full select-none "/> :
        <Image src="/images/bookmark_inactive.svg" alt="" fill className="select-none  w-full h-full"/>}
        </div>
      </div>
      <div className="overflow-hidden max-w-52">

      {isLongTitle ? (
        <Marquee>{title}</Marquee>):
      (<h2 className='leading-none font-bold text-[26px] max-w-[190px] text-white mb-2'>{title}</h2>)
      }
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
     { status === Status.STARTED ?
     (<div className="flex gap-2 items-center mt-4">
        <TbBook  color='white' size={16}/>
        <p className='font-medium uppercase text-slate-100 text-xs'>Started On { moment(new Date(startedAt!), 'DD.MM.YYYY').format('DD/MM/YYYY')}</p>
      </div>):status === Status.NOT_STARTED ? (
        <div  className="flex gap-2 items-center mt-4">
        <TbBook2   color='white' size={16}/>
        <p className='font-medium uppercase text-slate-100 text-xs'>Want to Read</p>
      </div>):status === Status.COMPLETED ? (
      <>
      <div  className="flex gap-2 items-center mt-4">
      <Check   color='white' size={16}/>
      <p className='font-medium uppercase text-slate-100 text-sm'>Completed</p>
    </div>
      <div  className="flex gap-2 items-center mt-2">
      <TbBook2   color='white' size={16}/>
      <p className='font-medium uppercase text-slate-100 text-xs'>Finished On {moment(book?.completedAt).format("DD/MM/YYYY")}</p>
    </div>
    </>
    ):null
      }
      {status === Status.STARTED &&
      (
        <div className="my-4 flex gap-2 items-center w-full">
          <progress
          style={{color:"#be1e2d"}}
          className='h-[8px] rounded-full overflow-hidden' value={currentPage!} max={pages}>70 %</progress>
          <p className='font-semibold text-white'>{calculatePercentageComplete(pages,currentPage!)}%</p>
        </div>
      )

      }
      <motion.div 
      animate={isOpen ? "open" : "closed"}
      variants={variants}
       
      transition={{ ease: "circInOut",duration: .15 }}
      // whileHover={{
      //   y: -180,scale:1.25
      // }}
      ref={ref} 
      className="h-full w-[calc(100%_-_48px)] absolute -bottom-48 hover:-translate-y-10 transition"
      onClick={(e) => handleCoverImageClick(e)}>
        {coverImage?<Image priority src={coverImage} alt="" layout='fill' objectFit='cover' className=' w-full h-full rounded-[20px] mt-4'/>:<div style={{background:`${user?.favColour}`}} className="w-full h-full rounded-[20px] mt-4"></div>}
      </motion.div>
    </div>
  )
}

export default BookCard