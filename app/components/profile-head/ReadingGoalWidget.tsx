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
    <div className="flex flex-col gap-2 px-6 md:px-12 w-full sm:w-auto">
      <h2 className="text-sm font-bold">{year} Reading Goal</h2>
      {isEditing || !target ? (
        <form onSubmit={handleSubmit(onSubmit)} className="flex items-center gap-2">
          <RawInput register={register} errors={errors} inputValidation={{ required: true, message: "Enter a goal" }} name="targetBooks" id="targetBooks" autoComplete="off" className="w-20" disabled={isSaving} />
          <span className="text-xs text-muted-foreground">books in {year}</span>
          <Button type="submit" disabled={isSaving} style={{ background: user?.favColour }} className="h-8 px-3 text-xs">Save</Button>
          {target ? <Button type="button" variant="outline" disabled={isSaving} onClick={() => setIsEditing(false)} className="h-8 px-3 text-xs">Cancel</Button> : null}
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <p className="text-sm"><span className="font-bold">{completedThisYear}</span> of <span className="font-bold">{target}</span> books</p>
          <progress style={{ color: user?.favColour || "#be1e2d" }} className="h-[8px] rounded-full overflow-hidden flex-1 max-w-[160px]" value={completedThisYear} max={target}>{percent}%</progress>
          <button type="button" onClick={() => setIsEditing(true)} className="text-xs text-muted-foreground hover:underline">Edit</button>
        </div>
      )}
    </div>
  )
}

export default ReadingGoalWidget
