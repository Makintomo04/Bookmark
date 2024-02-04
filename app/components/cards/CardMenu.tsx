import { Minus } from 'lucide-react'
import { FC } from 'react'
import { VscDiffRemoved } from "react-icons/vsc";

interface CardMenuProps {
  onRemove?:  (() => void) | ((e: React.MouseEvent<HTMLDivElement>) => void)
}

const CardMenu: FC<CardMenuProps> = ({onRemove}) => {
  return (
      <div className="h-auto w-52 rounded-lg bg-background shadow-sm overflow-hidden absolute top-[35px] z-10 right-12">
        <div className="flex flex-col text-left">
            <p onClick={onRemove} style={{}} className='text-left flex items-center text-md gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-black/70 transition font-semibold h-full p-4'><VscDiffRemoved size={18}/>Remove</p>
            </div>
      </div>
    )
}

export default CardMenu