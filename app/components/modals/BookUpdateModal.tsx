"use client"
import { FC, use, useEffect, useState } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { UploadButton } from '@/utils/uploadthing'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import Image from 'next/image'
import { Button } from '../ui/button'
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { ST } from 'next/dist/shared/lib/utils'
import { CirclePicker } from 'react-color'
import { set } from 'zod'
import axios from 'axios'
// import "primereact/resources/themes/lara-light-cyan/theme.css";
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import useBooks from '@/app/hooks/useBooks'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import { calculatePercentageComplete } from '@/utils/helpers'
import { Book } from '@prisma/client'
import useBookById from '@/app/hooks/useBookById'
import useFavourite from '@/app/hooks/useFavourite'

interface BookUpdateModalProps {
  
}

const BookUpdateModal: FC<BookUpdateModalProps> = ({}) => {
  const {user,isLoading:isUserLoading,isError,mutate} = useUser()
  const { books, isLoading:isBooksLoading, isError:isBooksError, mutate:booksMutate } = useBooks();
  const { myBooks, onOpen, onClose,getBook,bookId,getBookIsOpen,setBookIdState,book,setBook,getBookId } = useBookUpdateModal();
  const {favourites,hasFavourited, isLoading:isFavLoading,isError:isFavError,mutate:mutateFav} = useFavourite();
  const [isLoading, setIsLoading] = useState(false);
  const [bookCompletion,setBookCompletion] = useState({
    id: "",
    isComplete: false,
  })
  // const [step, setStep] = useState(STEPS.BOOK_INFO);
  // const [coverImageLink, setCoverImageLink] = useState("");
  const [colour,setColour] = useState<string>()
  const bookUpdateModal = useBookUpdateModal()
  const { specificBook, isLoading:isSpecificBookLoading, isError:isSpecificBookError, mutate:specificBookMutate } = useBookById(bookId);
 if(!isSpecificBookLoading)console.log("888777",specificBook);
 const { 
   register,
   handleSubmit,
   setValue,
   watch,
   getValues,
   formState:{errors},
   reset} = useForm<FieldValues>({
     defaultValues: {
      id: specificBook?.id,
      pagesUpdate: null,
      isStarted: specificBook?.status === "NOT_STARTED" ? false : true,
      isComplete: specificBook?.status === "COMPLETED" ? true : false,
      },
    })
    
    const isComplete = watch("isComplete");
    const isStarted = watch("isStarted");
    const id = watch("id");
    console.log("4444",specificBook,bookId);
    const [isCompleted, setIsCompleted] = useState<boolean>(book?.isComplete);
    useEffect(() => {
      console.log("5556666",isComplete);
      if(books && books.length > 0){
        useBookUpdateModal.getState().myBooks = books.map((book:Book) => ({
          id: book.id,
          isOpen: false, // Initial state for modals
          book, // Add the whole book object
        }));
      }
    },[books])
    useEffect(() => {
    },[onClose])
    useEffect(() => {
      setValue("isComplete",specificBook?.status === "COMPLETED" ? true : false)
      setValue("isStarted",specificBook?.status === "NOT_STARTED" ? false : true)
      setValue("id",bookId)
    },[book?.id,isSpecificBookLoading])
    
    const setCustomValue = (id: string, value: any) => {
      setValue(id, value, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true
      });
      // if(book){setCustomValue("id", getBook(book.id,useBookUpdateModal.getState())?.id)}
    }
    const handleRemove = () => {
      console.log("remove clicked",book.id);
      axios.delete(`/api/books/${book.id}`).then((res) => {
        console.log(res.data);
        bookUpdateModal.onClose(book.id)
        toast.success("Book Removed!",{ position: "bottom-center" })
        // mutateFav()
      }).catch((err) => {
        toast.error("Something went wrong!!",{ position: "bottom-center" })
      }).finally(() => {
        booksMutate()
        mutateFav()
      })
    }
    
    const onSubmit:SubmitHandler<FieldValues> =(data) =>{
    
   
   axios.post("/api/book-progress",data).then((res)=>{
    setIsLoading(true)
    console.log("££££",res);
     if (res.data.error){
       return toast.info(res.data.error,{ position: "bottom-center" })
        
     }
     if(res.data.message === "Book Started"){
        toast.success("New Book Started.",{ position: "bottom-center" })
      }else{
        toast.success("Book Progress Updated.",{ position: "bottom-center" })
      }
    reset({ ...data});
    mutate();
    booksMutate();
    // specificBookMutate();
    
    onClose(bookId)
    
   }).catch((err)=>{
     toast.error("Something went wrong!",{ position: "bottom-center" })
     console.log(err);
   }).finally(()=>{
     console.log("Done");
     setIsLoading(false);
   })
   }
   const handleChange = (val:boolean) => {
    setIsCompleted(val)
    setValue("isComplete", val);
   }
   const handleIsStartedChange = (val:boolean) => {
    setIsCompleted(val)
    setValue("isStarted", val);
   }
let body = (
  <div
  className="w-full h-auto min-h-[500px] sm:min-h-0 px-6"
>
  <div className="h-full w-full flex flex-col sm:flex-row gap-8">
    <div className=" h-full w-full flex-col-reverse mb-3 flex gap-6">

        <div className="h-[250px] sm:h-[400px] w-full rounded-[20px] overflow-hidden relative" >
          {book?.coverImage ? <Image src={book?.coverImage} alt="" layout="fill" className="shadow-md object-contain h-full w-full "/>: (
            <div style={{background:`${book?.cardColour}`}} className="h-full w-full"></div>
          )}
        </div>
        
</div>
    <div className="h-auto sm:h-full w-full">
      <div className="flex flex-col h-auto gap-4">
        <div className="flex flex-col gap-2">
          <div className="mb-3">
          <h2 className='text-5xl md:text-3xl font-bold text-pretty'>{bookUpdateModal?.book?.title}</h2>
          <h2 className='text-xl md:text-lg font-semibold text-muted-foreground'>{bookUpdateModal?.book?.author}</h2>
          </div>
          <h2 className='text-xl font-bold'>{bookUpdateModal?.book?.currentPage}/{bookUpdateModal?.book?.pages} <span className='font-medium'>Pages Read</span></h2>
        </div>
        <div className="my-4">
          <h2 className=' text-md font-semibold'>Progress</h2>
          {/* <Progress progress={calculatePercentageComplete(pages,currentPage)} className='flex-1 w-full text-[#9b59b6]' size="sm" color='red' /> */}
        <div className="flex gap-2 items-center w-5/6">
          <progress 
          style={{color:"#be1e2d"}}
          className='h-[8px] rounded-full overflow-hidden' value={bookUpdateModal?.book?.currentPage!} max={bookUpdateModal?.book?.pages}>70 %</progress>
          <p className='font-semibold ml-2 text-lg'>{calculatePercentageComplete(bookUpdateModal?.book?.pages,bookUpdateModal?.book?.currentPage!)}%</p>
        </div>
        </div>
        <div className="h-auto flex flex-col justify-between">

        <div className="flex flex-col gap-3">
        <Label className="text-md font-bold" htmlFor="title">How many pages did you read today?</Label>
        <Input register={register} errors={errors}  name="pagesUpdate" id="pagesUpdate" autoComplete='off' className="max-w-16"/>
        </div>
        <div className="flex gap-2 items-center mt-5">
        {specificBook?.status === "NOT_STARTED" ? (
        <><Label className="text-md font-bold" htmlFor="title">Mark as Started?</Label>
        <Checkbox register={register} errors={errors} checked={isStarted} 
                  onCheckedChange={(val)=>handleIsStartedChange(val as boolean)} name="isComplete" id="isComplete" className="max-w-24 h-5 w-5"/></>) : (<><Label className="text-md font-bold" htmlFor="title">Mark as Completed?</Label>
        <Checkbox register={register} errors={errors} checked={isComplete} 
                  onCheckedChange={(val)=>handleChange(val as boolean)} name="isComplete" id="isComplete" className="max-w-24 h-5 w-5"/></>)
                  }
        </div>
        </div>
        </div>
    </div>
      </div>
  
  </div>
)

const footer = (
  <div className="w-full p-6">
    <div className="flex items-center gap-3 justify-end mt-auto">
    <Button style={{border:`2px solid ${user?.favColour}`,background:"transparent",color:`${user?.favColour}`}} onClick={handleRemove}>Remove</Button>
    <Button style={{background:`${user?.favColour}`}} onClick={handleSubmit(onSubmit)}>Update</Button>
    </div>
  </div>
)
  return (
    <Modal
      title="Update Progress"
      body={body}
      footer={footer}
      onClose={()=>onClose(book?.id)}
      isOpen={getBookIsOpen(book?.id,useBookUpdateModal.getState())}
    />
  )
}

export default BookUpdateModal