import { FC, use, useState } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { Button } from 'flowbite-react'
import { UploadButton } from '@/utils/uploadthing'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { FieldValues, useForm } from 'react-hook-form'
import Image from 'next/image'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'

interface BookEntryModalProps {
  
}

const BookEntryModal: FC<BookEntryModalProps> = ({}) => {
  const {user,isLoading:isUserLoading,isError,mutate} = useUser()
  const [isLoading, setIsLoading] = useState(false);
  // const [coverImageLink, setCoverImageLink] = useState("");
 const bookEntryModal = useBookEntryModal()
 
  const { 
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState:{errors},
    reset} = useForm<FieldValues>({
    defaultValues: {
      title: "",
      author: "",
      pages: 0,
      coverImgSrc:"",
      isStarted: false,
      currentPage:0,
      cardColour: ""
    },
  })
  const imageSrc = watch("coverImgSrc");
  const setCustomValue = (id: string, value: any) => {
    setValue(id, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true
    });
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
        <Input register={register} errors={errors}  name="title" id="title" placeholder='e.g. The Great Gatsby' autoComplete='off' className="max-w-lg"/>
        </div>
        <div className="flex flex-col gap-2">
        <Label className="text-md font-bold" htmlFor="author">Author</Label>
        <Input register={register} errors={errors}  name="author" id="author" autoComplete='off' className="max-w-lg" placeholder='e.g. F. Scott Fitzgerald'/>
        </div> 
        <div className="flex flex-col gap-2">
        <Label className="text-md font-bold" htmlFor="author">Total Pages</Label>
        <Input register={register} errors={errors}  name="author" id="author" autoComplete='off' className="w-[100px]"/>
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
    <div className=" h-full w-full flex-col-reverse mb-3 flex gap-6">

        <div className="h-[350px] w-full rounded-[20px] overflow-hidden relative" style={{background:`${user?.favColour}`}}>
          {imageSrc ? <Image src={imageSrc} alt="" layout="fill" className="shadow-md object-contain h-full w-full "/>: (
            <div style={{background:`${user?.favColour}`}} className="h-full w-full"></div>
          )}
        </div>
        
</div>
      </div>
  
  </div>
)

const footer = (
  <div className="w-full p-6">
    <div className="flex items-center gap-3 justify-end">
    <Button style={{background:`${user?.favColour}`}} onClick={()=>{}}>Cancel</Button>
    <Button style={{background:`${user?.favColour}`}} onClick={()=>{}}>Save</Button>
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