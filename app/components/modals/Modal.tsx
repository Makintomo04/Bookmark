"use client";
import { FC, useCallback, useEffect, useState } from 'react'
import { IoClose } from 'react-icons/io5';
import Container from '../Container';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  title?:string;
  body?:React.ReactElement;
  footer?:React.ReactElement;
  actionLabel?:string;
  disabled?:boolean;
  secondaryAction?: () => void;
  secondaryActionLabel?:string;
}

const Modal: FC<ModalProps> = ({isOpen,onClose,onSubmit,title,body,footer,actionLabel,disabled,secondaryAction,secondaryActionLabel}) => {
  const [showModal,setShowModal] = useState(isOpen);
  useEffect(() => {
    setShowModal(isOpen);
  
  },[isOpen])
  const handleClose = useCallback(() => {
    if(disabled) return
    setShowModal(false)
      onClose()
  },[disabled,onClose])

  if(!isOpen) return null
  return (
    <div
    onClick={handleClose}
    // onClick={handleClose}
      className="
        justify-center 
        items-center 
        h-screen
        flex 
        overflow-x-hidden 
        overflow-y-hidden
        fixed 
        inset-0 
        z-50 
        outline-none 
        focus:outline-none
        bg-neutral-800/70
        
      "
    >
        {/* <Container> */}
      <div  onClick={(e) => e.stopPropagation()}  className="flex flex-col mb-auto sm:my-auto w-full sm:w-[650px] md:w-[800px] lg:w-[900px] h-full max-h-dvh overflow-hidden md:rounded-lg sm:h-auto min-h-[580px] bg-background shadow-md relative">
        <div className="p-6 pb-0 h-auto md:h-full overflow-hidden">
          <div className="flex justify-between items-center">
          <h1 className='text-3xl font-bold'>{title}</h1>
          <div className="p-2 bg-slate-200 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 cursor-pointer transition rounded-full" onClick={handleClose}>
          <IoClose size={24} />
          </div>
          </div>
          <hr className='my-6 border-1 border-slate-400/40'/>
        </div>
          <div className="flex flex-col min-h-[500px] justify-between w-full h-full relative">
        <div className="h-auto grid place-items-baseline sm:place-items-center overflow-y-auto flex-grow sm:min-h-0  max-h-max">
          
        {body}
        </div>
        <div className="">
        <hr className='mt-4 border-1 border-slate-400/40'/>
      
        {footer}
      
          </div>
        </div>
      </div>
        {/* </Container> */}
    </div>
  )
}

export default Modal