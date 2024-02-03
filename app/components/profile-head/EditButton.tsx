import useEditProfileModal from '@/app/hooks/useEditProfileModal';
import { cn } from '@/lib/utils';
import { FC } from 'react'
import { BsThreeDots } from "react-icons/bs";


interface EditButtonProps {
  handleClick?: (() => void) | ((e: React.MouseEvent<HTMLDivElement>) => void),
  className?: string,
}

const EditButton: FC<EditButtonProps> = ({handleClick,className}) => {
 
  return (
    <div onClick={handleClick} className={cn("cursor-pointer hover:bg-slate-700/20 flex justify-center items-center h-8 w-8 z-10  bg-slate-800/30 transition rounded-full",className)}>
      <BsThreeDots color='white' size={24}/>
    </div>
  )
}

export default EditButton