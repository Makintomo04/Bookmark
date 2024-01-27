import { FC, useRef, useState } from 'react'
import { Status, type Book } from '@prisma/client';
import { IoIosStar } from "react-icons/io";
import { FaRegCalendar } from "react-icons/fa6";
import moment from 'moment'
import Image from 'next/image';
import randomColor from 'randomcolor';
import {motion,cubicBezier} from 'framer-motion';
import {Progress} from "flowbite-react"
import { FiBook,FiBookOpen  } from "react-icons/fi";
import { TbBook,TbBook2  } from "react-icons/tb";
import useUser from '@/app/hooks/useUser';
interface BookCardProps {
  book: Book
}

const BookCard: FC<BookCardProps> = ({book}) => {
  // console.log(book);
  var color = randomColor(); 
  const {title, author, coverImage, description, pages,currentPage,startedAt,status,cardColour,rating} = book
  const {user,isLoading,isError,mutate} = useUser();
  function getRandomContrastingColor() {
    const contrastingColors = [
      "#ffcc99", // Peach
      "#c2c2f0", // Light Slate Blue
      "#f0f8ff", // Alice Blue
      "#c6f4c5", // Mint Cream
      "#90ee90", // Light Green
      "#333333", // Dark Gray
      "#2980b9", // Deep Sky Blue
      "#9b59b6", // Amethyst
      "#16a085", // Dark Cyan
      "#663399", // Rebecca Purple
      "#e9967a", // Dark Salmon
      "#4169e1", // Royal Blue
      "#009688", // Teal
      "#a52a2a", // Brown
      "#4f5b66", // Dark Slate Gray
    ];
  
    const randomIndex = Math.floor(Math.random() * contrastingColors.length);
    return contrastingColors[randomIndex];
  }
  const [isOpen, setIsOpen] = useState(false);
  let ref = useRef(null);
  console.log();
  const variants = {
    open: { opacity: 1, y: -180,scale:1.25 },
    closed: { opacity: 1, y: 0 },
  }
  const easing = cubicBezier(.35,.17,.3,.86)
  function calculatePercentageComplete(totalPages, currentPage) {
    if (totalPages === 0) {
      // Handle potential division by zero
      return 0;
    }
  
    const percentage = (currentPage / totalPages) * 100;
    return Math.round(percentage); // Round to whole number percentage
  }

  return (
    <div style={{background:`${cardColour}`}} className={`cursor-pointer h-[350px] w-full xl:w-[275px] overflow-hidden rounded-[20px] p-6 relative`}>
      
      <div className="absolute top-4 right-4 z-10">
        <div className="h-5 w-5 relative cursor-pointer ">
        <Image src="/images/bookmark_inactive.svg" alt="" fill  layout="fixed" className="w-full h-full"/>
        </div>
      </div>
      <h2 className='leading-none font-bold text-[28px] text-white mb-2'>{title}</h2>
      <div className="flex gap-4 items-center">
      <p className='font-medium text-[16px] text-white'>{author}</p>
     {rating && <div className="flex gap-1 items-center">
        <IoIosStar color='white' size={16}/>
        <p className='font-semibold text-white text-[16px]'>{rating}</p>
      </div>}
      </div>
     {status !== Status.NOT_STARTED ?
     (<div className="flex gap-2 items-center mt-4">
        <TbBook  color='white' size={16}/>
        <p className='font-medium uppercase text-slate-100 text-xs'>Started On { moment(startedAt).format('L')}</p>
      </div>):(<div  className="flex gap-2 items-center mt-4">
        <TbBook2   color='white' size={16}/>
        <p className='font-medium uppercase text-slate-100 text-xs'>Not Started</p>
      </div>)
    }
       <>
      <div className="mt-4 flex items-center gap-3">
      <p className="text-sm text-white"><span className="font-bold">0</span> Notes</p>
      <p className="text-sm text-white"><span className="font-bold">0</span> Quotes</p>
      </div>
      </>
      {status === Status.STARTED &&
      (
        <div className="my-4 flex gap-2 items-center w-full">
          {/* <Progress progress={calculatePercentageComplete(pages,currentPage)} className='flex-1 w-full text-[#9b59b6]' size="sm" color='red' /> */}
          <progress 
          style={{color:"#be1e2d"}}
          className='h-[8px] rounded-full overflow-hidden' value={currentPage} max={pages}>70 %</progress>
          <p className='font-semibold text-white'>{calculatePercentageComplete(pages,currentPage)}%</p>
        </div>
      )

      }
      <motion.div 
      // animate={isOpen ? "open" : "closed"}
      // variants={variants}
       
      // transition={{ ease: "circInOut",duration: .15 }}
      // whileHover={{
      //   y: -180,scale:1.25
      // }}
      ref={ref} 
      className="h-full w-[calc(100%_-_48px)] absolute -bottom-48 hover:-translate-y-10 transition"
      onClick={() => setIsOpen(isOpen => !isOpen)}>
        <Image src={coverImage} alt="" layout='fill' objectFit='cover' className=' w-full h-full rounded-[20px] mt-4'/>
      </motion.div>
    </div>
  )
}

export default BookCard