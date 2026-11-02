"use client"
import { FC, useEffect, useState } from 'react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { Textarea } from '../ui/textarea'
import { Button } from '../ui/button'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { Trash2 } from 'lucide-react'
import useBookNotesModal from '@/app/hooks/useBookNotesModal'
import useBookNotes from '@/app/hooks/useBookNotes'
import { Note } from '@prisma/client'
import moment from 'moment'
import useBooks from '@/app/hooks/useBooks'
import { RECOMMENDED_BY_MAX, recommendedByOf } from '@/lib/recommendRules'
import { readableInk } from '@/lib/colour'

interface BookNotesModalProps {

}

const BookNotesModal: FC<BookNotesModalProps> = ({}) => {
  const { user } = useUser()
  const accent = user?.favColour || '#D92D2D'
  const bookNotesModal = useBookNotesModal()
  const { isOpen, bookId, bookTitle, onClose } = bookNotesModal
  const { notes, isLoading, mutate } = useBookNotes(isOpen ? bookId : undefined)
  const [isSaving, setIsSaving] = useState(false)
  const { books, mutate: booksMutate } = useBooks({ onlyWhen: isOpen })
  const savedRecommender = recommendedByOf((books ?? []).find((b: { id: string }) => b.id === bookId) ?? {}) ?? ""
  const [recommender, setRecommender] = useState(savedRecommender)
  useEffect(() => { if (isOpen) setRecommender(savedRecommender) }, [isOpen, bookId, savedRecommender])

  // Who put this book on your radar. Saved when the field loses focus; only you see it.
  const saveRecommender = () => {
    const name = recommender.trim()
    if (name === savedRecommender) return
    axios.put(`/api/books/${bookId}/recommended-by`, { name }).then(() => booksMutate()).catch(() => {
      notify.error("Couldn't save who recommended it.")
      setRecommender(savedRecommender)
    })
  }

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
      notify.error("Couldn't save that note. Try again.")
    }).finally(() => setIsSaving(false))
  }

  const handleDelete = (noteId: string) => {
    axios.delete(`/api/books/${bookId}/notes/${noteId}`).then(() => {
      mutate()
    }).catch(() => {
      notify.error("Couldn't delete that note.", { retry: () => handleDelete(noteId) })
    })
  }

  const body = (
    <div className="w-full h-full px-6">
      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-col gap-2">
          <Label className="font-medium" htmlFor="recommended-by">Recommended by</Label>
          <ClearableInput id="recommended-by" value={recommender} maxLength={RECOMMENDED_BY_MAX} autoComplete="off"
            onChange={(e) => setRecommender(e.target.value)} onBlur={saveRecommender}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
            placeholder="A friend, a podcast, a bookshop..."
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2" />
          <p className="text-xs text-muted-foreground">Only you can see this.</p>
        </div>
        <hr className='my-2'/>
        <div className="flex flex-col gap-2">
          <Label className="font-medium" htmlFor="title">Title (leave blank for a quote)</Label>
          <Input register={register} errors={errors} name="title" id="title" autoComplete='off' placeholder='e.g. On Chapter 3'/>
        </div>
        <div className="flex flex-col gap-2">
          <Label className="font-medium" htmlFor="content">Note or quote</Label>
          <Textarea register={register} errors={errors} name="content" id="content" autoComplete='off' placeholder="Jot something down..."/>
        </div>
        <Button loading={isSaving} style={{ background: accent, color: readableInk(accent) }} onClick={handleSubmit(onSubmit)} className="w-fit">Add</Button>
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
              <button type="button" aria-label="Delete note" onClick={() => handleDelete(note.id)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Trash2 size={16} aria-hidden />
              </button>
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
