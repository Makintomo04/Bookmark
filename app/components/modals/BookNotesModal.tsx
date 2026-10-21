"use client"
import { FC, useState } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Button } from '../ui/button'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import axios from 'axios'
import { toast } from 'react-toastify'
import { VscDiffRemoved } from "react-icons/vsc"
import useBookNotesModal from '@/app/hooks/useBookNotesModal'
import useBookNotes from '@/app/hooks/useBookNotes'
import { Note } from '@prisma/client'
import moment from 'moment'

interface BookNotesModalProps {

}

const BookNotesModal: FC<BookNotesModalProps> = ({}) => {
  const { user } = useUser()
  const bookNotesModal = useBookNotesModal()
  const { isOpen, bookId, bookTitle, onClose } = bookNotesModal
  const { notes, isLoading, mutate } = useBookNotes(isOpen ? bookId : undefined)
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FieldValues>({
    defaultValues: { title: "", content: "" }
  })

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    if (!data.content?.trim()) return
    setIsSaving(true)
    axios.post(`/api/books/${bookId}/notes`, data).then(() => {
      reset({ title: "", content: "" })
      mutate()
    }).catch(() => {
      toast.error("Something went wrong!", { position: "bottom-center" })
    }).finally(() => setIsSaving(false))
  }

  const handleDelete = (noteId: string) => {
    axios.delete(`/api/books/${bookId}/notes/${noteId}`).then(() => {
      mutate()
    }).catch(() => {
      toast.error("Something went wrong!", { position: "bottom-center" })
    })
  }

  const body = (
    <div className="w-full h-full px-6">
      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-col gap-2">
          <Label className="text-md font-bold" htmlFor="title">Title (leave blank for a quote)</Label>
          <Input register={register} errors={errors} name="title" id="title" autoComplete='off' placeholder='e.g. On Chapter 3'/>
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-md font-bold" htmlFor="content">Note or Quote</Label>
          <Textarea register={register} errors={errors} name="content" id="content" autoComplete='off' placeholder="Jot something down..."/>
        </div>
        <Button disabled={isSaving} style={{background:`${user?.favColour}`}} onClick={handleSubmit(onSubmit)} className="w-fit">Add</Button>
        <hr className='my-2'/>
        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
          {isLoading && <p className='text-sm text-muted-foreground'>Loading...</p>}
          {!isLoading && notes?.length === 0 && <p className='text-sm text-muted-foreground'>No notes or quotes yet.</p>}
          {notes?.map((note: Note) => (
            <div key={note.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-neutral-700">
              <div className="min-w-0">
                {note.title && <p className='font-semibold text-sm'>{note.title}</p>}
                <p className='text-sm whitespace-pre-wrap'>{note.title ? note.content : `"${note.content}"`}</p>
                <p className='text-xs text-muted-foreground mt-1'>{moment(note.createdAt).format("DD/MM/YYYY")}</p>
              </div>
              <VscDiffRemoved size={18} className='cursor-pointer flex-shrink-0 mt-1' onClick={() => handleDelete(note.id)}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const footer = (
    <div className="w-full p-6">
      <div className="flex items-center gap-3 justify-end">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  )

  return (
    <Modal
      title={bookTitle ? `Notes — ${bookTitle}` : "Notes"}
      body={body}
      footer={footer}
      onClose={onClose}
      isOpen={isOpen}
    />
  )
}

export default BookNotesModal
