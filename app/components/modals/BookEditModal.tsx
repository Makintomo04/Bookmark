"use client"
import { FC, useEffect } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { UploadButton } from '@/utils/uploadthing'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import Image from 'next/image'
import { Button } from '../ui/button'
import { CirclePicker } from 'react-color'
import axios from 'axios'
import useBooks from '@/app/hooks/useBooks'
import useBookEditModal from '@/app/hooks/useBookEditModal'
import { GENRES, isOpenLibraryCover } from '@/utils/helpers'

interface BookEditModalProps {

}

const colourList = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#a4b31e", "#cfbb00", "#ffc107", "#ff9800", "#ff5722", "#795548", "#607d8b"]

const BookEditModal: FC<BookEditModalProps> = ({}) => {
  const { user } = useUser()
  const { mutate: booksMutate } = useBooks()
  const bookEditModal = useBookEditModal()
  const { book, isOpen, onClose } = bookEditModal

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset
  } = useForm<FieldValues>({
    defaultValues: {
      title: "",
      author: "",
      pages: 0,
      coverImgSrc: "",
      cardColour: "#f44336",
      genre: ""
    }
  })

  useEffect(() => {
    if (!book) return
    reset({
      title: book.title,
      author: book.author,
      pages: book.pages,
      coverImgSrc: book.coverImage,
      cardColour: book.cardColour || "#f44336",
      genre: book.genre || ""
    })
  }, [book, reset])

  const coverImgSrc = watch("coverImgSrc")
  const cardColour = watch("cardColour")

  const setCustomValue = (id: string, value: any) => {
    setValue(id, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true
    })
  }

  const handleColourChange = (color: any) => {
    setCustomValue("cardColour", color.hex)
  }

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    if (!book) return
    axios.patch(`/api/books/${book.id}`, data).then(() => {
      toast.success("Book Updated!", { position: "bottom-center" })
      booksMutate()
      onClose()
    }).catch(() => {
      toast.error("Something went wrong!", { position: "bottom-center" })
    })
  }

  const body = (
    <div className="w-full h-full px-6">
      <div className="h-full w-full flex flex-col sm:flex-row gap-12">
        <div className="h-full w-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-md font-bold" htmlFor="title">Book Title</Label>
              <Input register={register} inputValidation={{ required: true, message: "Book title required" }} errors={errors} name="title" id="title" autoComplete='off' className="max-w-lg" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-md font-bold" htmlFor="author">Author</Label>
              <Input register={register} inputValidation={{ required: true, message: "Author name required" }} errors={errors} name="author" id="author" autoComplete='off' className="max-w-lg" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-md font-bold" htmlFor="pages">Total Pages</Label>
              <Input register={register} errors={errors} inputValidation={{ min: 1, required: true, message: "Number of Total pages must be greater than 0" }} name="pages" id="pages" autoComplete='off' className="w-[100px]" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-md font-bold" htmlFor="genre">Genre</Label>
              <Input register={register} errors={errors} name="genre" id="genre" list="genre-options-edit" autoComplete='off' className="max-w-lg" placeholder='e.g. Fantasy' />
              <datalist id="genre-options-edit">
                {GENRES.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="min-w-max">
              <h2 className='text-md font-bold mb-2'>Book Cover</h2>
              <UploadButton
                appearance={{ button({ ready, isUploading, uploadProgress }) { return { background: user?.favColour } } }}
                className='items-start'
                endpoint="imageUploader"
                onClientUploadComplete={(res) => {
                  setCustomValue("coverImgSrc", res[0]?.url)
                  toast.success("Upload completed", { position: "bottom-center" })
                }}
                onUploadError={(error: Error) => {
                  toast.error(error.message, { position: "bottom-center" })
                }}
              />
            </div>
          </div>
        </div>
        <div className="h-full w-full flex-col mb-3 flex gap-6">
          <div className="h-full w-full min-h-[200px] rounded-[20px] overflow-hidden relative" style={{ background: `${cardColour}` }}>
            {coverImgSrc ? <Image src={coverImgSrc} alt="" layout="fill" unoptimized={isOpenLibraryCover(coverImgSrc)} className="shadow-md object-contain h-full w-full" /> : (
              <div style={{ background: `${cardColour}` }} className="h-full w-full"></div>
            )}
          </div>
          <div className="w-full">
            <Label className="text-md font-bold" htmlFor="cardColour">Card Colour</Label>
            <CirclePicker className='w-full mt-2' circleSize={32} circleSpacing={12} width="100%" color={cardColour || "#f44336"} onChange={handleColourChange} colors={colourList} />
          </div>
        </div>
      </div>
    </div>
  )

  const footer = (
    <div className="w-full h-full mt-auto p-6">
      <div className="flex items-center gap-3 justify-end mt-auto">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button style={{ background: `${user?.favColour}` }} onClick={handleSubmit(onSubmit)}>Save Changes</Button>
      </div>
    </div>
  )

  return (
    <Modal
      title="Edit Book"
      body={body}
      footer={footer}
      onClose={onClose}
      isOpen={isOpen}
    />
  )
}

export default BookEditModal
