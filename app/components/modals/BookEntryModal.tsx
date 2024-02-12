"use client"
import { FC, use, useState } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { UploadButton } from '@/utils/uploadthing'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { FieldErrors, FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import Image from 'next/image'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import { Button } from '../ui/button'
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { ST } from 'next/dist/shared/lib/utils'
import { CirclePicker } from 'react-color'
import { set } from 'zod'
import axios from 'axios'
import { ErrorMessage } from "@hookform/error-message"
// import "primereact/resources/themes/lara-light-cyan/theme.css";
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import useBooks from '@/app/hooks/useBooks'
import ErrorMessageComponent from '../ErrorMessageComponent'

interface BookEntryModalProps {
  
}
const colourList = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#a4b31e", "#cfbb00", "#ffc107", "#ff9800", "#ff5722", "#795548", "#607d8b"]
enum STEPS {
  BOOK_INFO = 0,
  READING_PROGRESS = 1,
  BOOK_COLOUR = 2,
  SET_PAGES = 3,
}

const BookEntryModal: FC<BookEntryModalProps> = ({}) => {
  const {user,isLoading:isUserLoading,isError,mutate} = useUser()
  const { books, isLoading:isBooksLoading, isError:isBooksError, mutate:booksMutate } = useBooks();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(STEPS.BOOK_INFO);
  // const [coverImageLink, setCoverImageLink] = useState("");
  const [colour,setColour] = useState<string>()
 const bookEntryModal = useBookEntryModal()

 const { 
   register,
   handleSubmit,
   setValue,
   watch,
   getValues,
   setError,
   formState:{errors},
   reset} = useForm<FieldValues>({
     defaultValues: {
       title: "",
       author: "",
       pages: 0,
       coverImgSrc:"",
       isStarted: false,
       startedAt: Date.now(),
       currentPage:1,
       cardColour: ""
      },
    })
    const imageSrc = watch("coverImgSrc");
    const isStarted = watch("isStarted");
    const cardColour = watch("cardColour");
    const startedAt = watch("startedAt");
    
    const setCustomValue = (id: string, value: any) => {
      setValue(id, value, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true
      });
    }

    const onSubmit:SubmitHandler<FieldValues> =(data) =>{
    console.log("Hello");
     console.log("@@@@2",data);
     console.log("PPPP",imageSrc);
     if(step !== STEPS.BOOK_COLOUR) {
       return onNext()
     }
   axios.post("/api/books",data).then((res)=>{
    setIsLoading(true)
    console.log("££££",res);
     
    toast.success("Book Entry Created.",{ position: "bottom-center" })
    reset();
    booksMutate();
    mutate();
    setStep(STEPS.BOOK_INFO)
    bookEntryModal.onClose()
   }).catch((err)=>{
     toast.error("Something went wrong!",{ position: "bottom-center" })
     console.log(err);
   }).finally(()=>{
     console.log("Done");
     setIsLoading(false);
   })
   }
    const onNext = () => {
    
     if(step === STEPS.READING_PROGRESS) {
       console.log(getValues("isStarted"));
       if(getValues("isStarted") === true) {
         return setStep(STEPS.SET_PAGES)
         
       }
       else {
         
         return setStep(STEPS.BOOK_COLOUR)
       }
     }
     if(step === STEPS.SET_PAGES) {
       return setStep(STEPS.BOOK_COLOUR)
     }
     setStep((step)=>step + 1)
   }
   const onBack = () => {
     if(step === STEPS.BOOK_INFO) {
       return
     }
     if(step === STEPS.SET_PAGES) {
       return setStep(STEPS.READING_PROGRESS)
     }
     if(step === STEPS.BOOK_COLOUR && isStarted) {
       return setStep(STEPS.SET_PAGES)
     }
     setStep((step)=>step - 1)
   }
let body = (
  <div
  className="w-full h-full px-6"
>
  <div className="h-full w-full flex flex-col sm:flex-row gap-12">
    <div className="h-full w-full">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
        <Label className="text-md font-bold" htmlFor="title">Book Title</Label>
        <Input register={register} inputValidation={{required:true,message:"Book title required"}} errors={errors}  name="title" id="title" placeholder='e.g. The Great Gatsby' disabled={isLoading} autoComplete='off' className="max-w-lg" required/>
        </div>
        <div className="flex flex-col gap-2">
        <Label className="text-md font-bold" htmlFor="author">Author</Label>
        <Input register={register} inputValidation={{required:true,message:"Author name required"}} errors={errors}  name="author" id="author" autoComplete='off' className="max-w-lg" disabled={isLoading} placeholder='e.g. F. Scott Fitzgerald' required/>
        </div> 
        <div className="flex flex-col gap-2">
        <Label className="text-md font-bold" htmlFor="pages">Total Pages</Label>
        <Input register={register} errors={errors} inputValidation={{min:1,required:true,message:"Number of Total pages must be greater than 0"}}  name="pages" id="pages" autoComplete='off' className="w-[100px]" disabled={isLoading} required/>
        </div> 
        <div className="min-w-max">
        <h2 className='text-md font-bold mb-2'>Upload Book Cover</h2>
        <UploadButton
        appearance={{
          button({ ready, isUploading,uploadProgress }) {
            return {
              background: user?.favColour,
          }}}}
    className='items-start'
    endpoint="imageUploader"
    onUploadBegin={() => {
      setIsLoading(true);
    }}
    onClientUploadComplete={(res) => {
      // Do something with the response
      console.log("Files: ", res);
      // setCoverImageLink(res[0]?.url)
      setCustomValue("coverImgSrc",res[0]?.url)
      toast.success("Upload completed",{
        position: "bottom-center"
      })
      setIsLoading(false);
      // alert("Upload Completed");
    }}
    onUploadError={(error: Error) => {
      // Do something with the error.
      toast.error(error.message,
        {
          position: "bottom-center"
        })
      alert(`ERROR! ${error.message}`);
    }}
  /> 
  </div>
        </div>
    </div>
    <div className=" h-full w-full flex-col mb-3 flex gap-6">

        <div className="h-full w-full min-h-[200px] rounded-[20px] overflow-hidden relative" style={{background:`${user?.favColour}`}}>
          {imageSrc ? <Image src={imageSrc} alt="" layout="fill" className="shadow-md object-contain h-full w-full "/>: (
            <div style={{background:`${user?.favColour}`}} className="h-full w-full"></div>
            )}
        </div>
            <ErrorMessageComponent errors={errors} name="coverImgSrc"/>
        
</div>
      </div>
  
  </div>
)
const onValChange = (val:any) => {
  console.log(val);
  if(val == 'true') {
    // setCustomValue("isStarted",true)
    setValue("isStarted",true)
    
  } else {
    setValue("isStarted",false)
  }

}
step === STEPS.READING_PROGRESS && (
  body = (
    <div
    className="w-full h-full px-6"
  >
    <div className="h-full w-full flex flex-col sm:flex-row gap-12">
      <div className="h-full w-full">
        <div className="flex flex-col justify-center items-center h-full gap-4 text-center">
          <div className="flex flex-col justify-center items-center gap-2">
          <Label className="text-md font-bold" htmlFor="title">Have you started this book?</Label>
          <div className="flex items-center space-x-2">
      <RadioGroup defaultValue={`${isStarted}`} name="isStarted"  id="isStarted" className='flex' onValueChange={onValChange} >
      <div className="flex gap-1 items-center"><RadioGroupItem  value="true" id="true"
          >
          </RadioGroupItem>
          <label
        htmlFor="true"
        className="text-sm uppercase font-bold leading-none peer-disabled:cursor-not-allowed cursor-pointer peer-disabled:opacity-70 p-2"
      >
        Yes
      </label>
          </div>
     <div className="flex gap-1 items-center">
      <RadioGroupItem  value="false" id="false"
          >
          </RadioGroupItem>
              <label
        htmlFor="false"
        className="text-sm uppercase font-bold leading-none peer-disabled:cursor-not-allowed cursor-pointer peer-disabled:opacity-70 p-2"
      >
        No
      </label>
      </div> 
      </RadioGroup>
      
    </div>
          </div>
          
        
    </div>
    </div>
    </div>
    </div>
  )
)
const handleChange =(color:any)=> {
  // setColour(color.hex)
  setValue("cardColour",color.hex)
  console.log(cardColour);
  // color = {
  //   hex: '#333',
  //   rgb: {
  //     r: 51,
  //     g: 51,
  //     b: 51,
  //     a: 1,
  //   },
  //   hsl: {
  //     h: 0,
  //     s: 0,
  //     l: .20,
  //     a: 1,
  //   },
  // }
}
step === STEPS.BOOK_COLOUR && (
  body = (
    <div
    className="w-full h-full px-6"
  >
    <div className="h-full w-full flex flex-col sm:flex-row gap-12">
      <div className="h-full w-full">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
          <Label className="text-md font-bold" htmlFor="title">Select a card colour</Label>
         
         <div className="w-full">
          <CirclePicker className='w-full' circleSize={64} width="100%"color={cardColour || "#f44336"} onChange={ handleChange } colors={colourList}/>
         </div>
       
    </div>
       
    </div>
    </div>
       
    </div>
    </div>
  )
)
const handleCalenderChange = (value:any) => {
  console.log(new Date(value));
  setCustomValue("startedAt",value)
}
step === STEPS.SET_PAGES && (
  body = (
    <div
    className="w-full h-full px-6"
  >
    <div className="h-full w-full flex flex-col sm:flex-row gap-12">
      <div className="h-full w-full">
        <div className="flex flex-col justify-center items-center h-full gap-4">
          <div className="flex flex-col justify-center items-center gap-2">
          <Label className="text-md font-bold" htmlFor="currentPage">When did you start?</Label>
          <Calendar  value={startedAt} onChange={(value) => handleCalenderChange(value)} />
       
    </div>
          <div className="flex flex-col justify-center items-center gap-2 pb-2">
          <Label className="text-md font-bold" htmlFor="currentPage">What page are you on?</Label>
          <Input register={register} errors={errors}  name="currentPage" id="currentPage" autoComplete='off' className="w-[100px]"/>
       
    </div>
       
    </div>
    </div>
       
    </div>
    </div>
  )
)

const footer = (
  <div className="w-full h-full mt-auto p-6">
    <div className="flex items-center gap-3 justify-end mt-auto">
    
    {step > STEPS.BOOK_INFO && <Button  onClick={onBack} variant="outline" className="border-slate-700 rounded-md py-2">Back</Button>}
    <Button style={{background:`${user?.favColour}`}} onClick={handleSubmit(onSubmit)}>{step === STEPS.BOOK_COLOUR ? "Create" : "Continue"}</Button>
    </div>
  </div>
)
  return (
    <Modal
      title="Add a Book"
      body={body}
      footer={footer}
      onClose={bookEntryModal.onClose}
      isOpen={bookEntryModal.isOpen}
    />
  )
}

export default BookEntryModal