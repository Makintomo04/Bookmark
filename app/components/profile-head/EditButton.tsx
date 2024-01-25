import { FC } from 'react'
import { BsThreeDots } from "react-icons/bs";


interface EditButtonProps {
  
}

const EditButton: FC<EditButtonProps> = ({}) => {
  return (
    <div className="cursor-pointer hover:bg-slate-700/20 flex justify-center items-center h-8 w-8 z-10 bottom-3 right-3 bg-slate-800/30 transition rounded-full absolute">
      <BsThreeDots color='white' size={24}/>
    </div>
  )
}

export default EditButton