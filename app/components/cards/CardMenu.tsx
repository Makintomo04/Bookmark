import { Minus } from 'lucide-react'
import { FC } from 'react'
import { VscDiffRemoved } from "react-icons/vsc";
import { FiEdit2 } from "react-icons/fi";
import { BsChatSquareQuote } from "react-icons/bs";

interface CardMenuProps {
  onRemove?:  (() => void) | ((e: React.MouseEvent<HTMLDivElement>) => void)
  onEdit?:  (() => void) | ((e: React.MouseEvent<HTMLDivElement>) => void)
  onNotes?:  (() => void) | ((e: React.MouseEvent<HTMLDivElement>) => void)
}

const CardMenu: FC<CardMenuProps> = ({onRemove,onEdit,onNotes}) => {
  return (
      <div className="h-auto w-52 rounded-lg bg-background shadow-sm overflow-hidden absolute top-[35px] z-10 right-12">
        <div className="flex flex-col text-left">
            {onEdit && <p onClick={onEdit} style={{}} className='text-left flex items-center text-md gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-black/70 transition font-semibold h-full p-4'><FiEdit2 size={18}/>Edit</p>}
            {onNotes && <p onClick={onNotes} style={{}} className='text-left flex items-center text-md gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-black/70 transition font-semibold h-full p-4'><BsChatSquareQuote size={18}/>Notes</p>}
            <p onClick={onRemove} style={{}} className='text-left flex items-center text-md gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-black/70 transition font-semibold h-full p-4'><VscDiffRemoved size={18}/>Remove</p>
            </div>
      </div>
    )
}

export default CardMenu