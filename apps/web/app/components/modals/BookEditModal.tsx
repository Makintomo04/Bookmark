"use client"
import { FC, useEffect, useState } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { UploadButton } from '@/utils/uploadthing'
import { notify } from '@/lib/notify'
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
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import FormatPicker, { type FormatChoice, formatPayload } from '../books/FormatPicker'
import { readableInk } from '@/lib/colour'
import CoverLinkInput from '../books/CoverLinkInput'

interface BookEditModalProps {

}

const colourList = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#a4b31e", "#cfbb00", "#ffc107", "#ff9800", "#ff5722", "#795548", "#607d8b"]

const BookEditModal: FC<BookEditModalProps> = ({}) => {
  const { user } = useUser()
  const accent = user?.favColour || '#D92D2D'
  const accentInk = readableInk(accent)
  const bookEditModal = useBookEditModal()
  const { book, isOpen, onClose } = bookEditModal
  // Only refreshes the shelf, so it never needs to load it.
  const { mutate: booksMutate } = useBooks({ onlyWhen: false })
  const [format, setFormat] = useState<FormatChoice>("PRINT")

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
      genre: "",
      hours: "",
      minutes: "",
    }
  })

  useEffect(() => {
    if (!book) return
    const audio = book.progressUnit === "MINUTES" && (book.audioMinutes ?? 0) > 0
    setFormat(audio ? "AUDIOBOOK" : "PRINT")
    reset({
      title: book.title,
      author: book.author,
      pages: book.pages || "",
      coverImgSrc: book.coverImage,
      cardColour: book.cardColour || "#f44336",
      genre: book.genre || "",
      hours: audio ? String(Math.floor((book.audioMinutes ?? 0) / 60)) : "",
      minutes: audio ? String((book.audioMinutes ?? 0) % 60) : "",
    })
  }, [book, reset])

  const coverImgSrc = watch("coverImgSrc")
  const cardColour = watch("cardColour")
  const isAudio = format === "AUDIOBOOK"

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
    const runningTime = (parseInt(data.hours) || 0) * 60 + (parseInt(data.minutes) || 0)
    if (isAudio && runningTime <= 0) {
      notify.error("Enter the audiobook's running time")
      return
    }
    if (!isAudio && !(parseInt(data.pages) > 0)) {
      notify.error("Enter the number of pages")
      return
    }
    const { hours, minutes, ...rest } = data
    axios.patch(`/api/books/${book.id}`, { ...rest, pages: rest.pages || "", ...formatPayload(format, runningTime) }).then(() => {
      booksMutate()
      copyCoverLater(book.id)
      onClose()
    }).catch(() => {
      notify.error("Couldn't save those changes. Try again.")
    })
  }

  const body = (
    <div className="w-full h-full px-6">
      <div className="h-full w-full flex flex-col sm:flex-row gap-12">
        <div className="h-full w-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="font-medium" htmlFor="title">Title</Label>
              <Input register={register} inputValidation={{ required: true, message: "Book title required" }} errors={errors} name="title" id="title" autoComplete='off' className="max-w-lg" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="font-medium" htmlFor="author">Author</Label>
              <Input register={register} inputValidation={{ required: true, message: "Author name required" }} errors={errors} name="author" id="author" autoComplete='off' className="max-w-lg" required />
            </div>
            <FormatPicker value={format} onChange={setFormat} />
            {isAudio ? (
              <div className="flex flex-col gap-2">
                <Label className="font-medium" htmlFor="hours">Running time</Label>
                <div className="flex items-center gap-2">
                  <Input register={register} errors={errors} type="number" min={0} name="hours" id="hours" placeholder="0" autoComplete='off' className="w-[72px]" />
                  <span className="text-sm text-muted-foreground">h</span>
                  <Input register={register} errors={errors} type="number" min={0} max={59} name="minutes" id="minutes" placeholder="00" autoComplete='off' className="w-[72px]" />
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
                <p className="text-xs text-muted-foreground">Progress is logged in minutes listened. Your place is kept as a percent if you switch.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label className="font-medium" htmlFor="pages">Total pages</Label>
                <Input register={register} errors={errors} inputValidation={{ min: 1, message: "Number of Total pages must be greater than 0" }} name="pages" id="pages" autoComplete='off' className="w-[100px]" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label className="font-medium" htmlFor="genre">Genre</Label>
              <Input register={register} errors={errors} name="genre" id="genre" list="genre-options-edit" autoComplete='off' className="max-w-lg" placeholder='e.g. Fantasy' />
              <datalist id="genre-options-edit">
                {GENRES.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="min-w-max">
              <h2 className='text-sm font-medium mb-2'>Cover</h2>
              <UploadButton
                appearance={{ button({ ready, isUploading, uploadProgress }) { return { background: accent, color: accentInk } } }}
                className='items-start'
                endpoint="imageUploader"
                onClientUploadComplete={(res) => {
                  setCustomValue("coverImgSrc", res[0]?.url)
                }}
                onUploadError={(error: Error) => {
                  notify.error(error.message || "Upload failed. Try another image.")
                }}
              />
              <div className="mt-2 max-w-sm">
                <CoverLinkInput onCopied={(url) => setCustomValue("coverImgSrc", url)} />
              </div>
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
            <Label className="font-medium" htmlFor="cardColour">Card colour</Label>
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
        <Button style={{ background: accent, color: accentInk }} onClick={handleSubmit(onSubmit)}>Save changes</Button>
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
