"use client"
import { FC, useState } from 'react'
import { Book } from '@prisma/client'
import axios from 'axios'
import { toast } from 'react-toastify'
import useBooks from '@/app/hooks/useBooks'
import useReadingGoal from '@/app/hooks/useReadingGoal'
import useUser from '@/app/hooks/useUser'
import { Button } from '../ui/button'
import { Input as RawInput } from '../ui/input'
import { useForm, FieldValues, SubmitHandler } from 'react-hook-form'

interface ReadingGoalWidgetProps {

}

const ReadingGoalWidget: FC<ReadingGoalWidgetProps> = ({}) => {
  const { user } = useUser()
  const year = new Date().getFullYear()
  const { books } = useBooks()
  const { goal, isLoading, mutate } = useReadingGoal(year)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FieldValues>({
    defaultValues: { targetBooks: goal?.targetBooks || 12 },
  })

  const completedThisYear = books?.filter((book: Book) =>
    book.status === "COMPLETED" && book.completedAt && new Date(book.completedAt).getFullYear() === year
  ).length || 0

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsSaving(true)
    axios.post("/api/reading-goal", { year, targetBooks: data.targetBooks })
      .then(() => {
        toast.success("Reading goal updated!", { position: "bottom-center" })
        mutate()
        setIsEditing(false)
      })
      .catch(() => {
        toast.error("Something went wrong.", { position: "bottom-center" })
      })
      .finally(() => setIsSaving(false))
  }

  if (isLoading) return null

  const target = goal?.targetBooks
  const percent = target ? Math.min(100, Math.round((completedThisYear / target) * 100)) : 0

  return (
    <div className="mt-5 max-w-md rounded-lg bg-neutral-100 dark:bg-neutral-900 px-4 py-3">
      {isEditing || !target ? (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="targetBooks" className="text-sm font-medium mr-1">{year} reading goal</label>
          <RawInput register={register} errors={errors} inputValidation={{ required: true, message: "Enter a goal" }} name="targetBooks" id="targetBooks" type="number" min={1} autoComplete="off" className="w-20 h-8" disabled={isSaving} />
          <span className="text-sm text-muted-foreground">books</span>
          <Button type="submit" disabled={isSaving} className="h-8 px-3 text-xs">Save</Button>
          {target ? <Button type="button" variant="outline" disabled={isSaving} onClick={() => setIsEditing(false)} className="h-8 px-3 text-xs">Cancel</Button> : null}
        </form>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p className="font-medium">{year} reading goal</p>
            <p className="text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{completedThisYear}</span> of {target} books
              <button type="button" onClick={() => setIsEditing(true)} className="ml-3 text-xs hover:text-foreground hover:underline">Edit</button>
            </p>
          </div>
          <div
            role="progressbar"
            aria-label={`${year} reading goal`}
            aria-valuenow={completedThisYear}
            aria-valuemin={0}
            aria-valuemax={target}
            className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
          >
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: user?.favColour || "#F13C3C" }} />
          </div>
        </>
      )}
    </div>
  )
}

export default ReadingGoalWidget
