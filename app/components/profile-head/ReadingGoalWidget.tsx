"use client"
import { FC, useState } from 'react'
import { Book } from '@prisma/client'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { Pencil, Target } from 'lucide-react'
import useBooks from '@/app/hooks/useBooks'
import useReadingGoal from '@/app/hooks/useReadingGoal'
import useUser from '@/app/hooks/useUser'
import { cn } from '@/lib/utils'
import { Input as RawInput } from '../ui/input'
import { useForm, FieldValues, SubmitHandler } from 'react-hook-form'
import { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'

const RING_RADIUS = 22
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

// How far through the year we are, 0–1, so progress can be judged against the date.
const yearFraction = (now: Date) => {
  const start = new Date(now.getFullYear(), 0, 1).getTime()
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime()
  return (now.getTime() - start) / (end - start)
}

const pace = (completed: number, target: number) => {
  const left = target - completed
  if (left <= 0) return { text: completed > target ? `Goal smashed · ${completed - target} over` : "Goal reached", tone: "good" as const }
  const diff = Math.round(completed - target * yearFraction(new Date()))
  const toGo = `${left} to go`
  if (diff > 0) return { text: `${diff} ahead of pace · ${toGo}`, tone: "good" as const }
  if (diff < 0) return { text: `${-diff} behind pace · ${toGo}`, tone: "behind" as const }
  return { text: `On pace · ${toGo}`, tone: "neutral" as const }
}

const toneClass = {
  good: "text-emerald-600 dark:text-emerald-400",
  behind: "text-amber-600 dark:text-amber-400",
  neutral: "text-muted-foreground",
}

const ReadingGoalWidget: FC = () => {
  const { user } = useUser()
  const year = new Date().getFullYear()
  const { books } = useBooks()
  const { goal, isLoading, mutate } = useReadingGoal(year)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FieldValues>({
    defaultValues: { targetBooks: 12 },
  })

  const completedThisYear = books?.filter((book: Book) =>
    book.status === "COMPLETED" && book.completedAt && new Date(book.completedAt).getFullYear() === year
  ).length || 0

  const startEditing = () => {
    reset({ targetBooks: goal?.targetBooks || 12 })
    setIsEditing(true)
  }

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsSaving(true)
    axios.post("/api/reading-goal", { year, targetBooks: data.targetBooks })
      .then(() => {
        mutate()
        setIsEditing(false)
      })
      .catch(() => {
        notify.error("Couldn't save your goal. Try again.", { retry: () => onSubmit(data) })
      })
      .finally(() => setIsSaving(false))
  }

  if (isLoading) return null

  const target = goal?.targetBooks

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <label htmlFor="targetBooks" className="block text-sm font-medium">How many books do you want to read in {year}?</label>
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <div className="w-20">
            <RawInput register={register} errors={errors} inputValidation={{ required: true, min: 1, message: "Enter a goal" }} name="targetBooks" id="targetBooks" type="number" min={1} autoComplete="off" autoFocus className="h-9" disabled={isSaving} />
          </div>
          <span className="self-center text-sm text-muted-foreground mr-auto">books</span>
          <button type="button" disabled={isSaving} onClick={() => setIsEditing(false)} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={isSaving} className={primaryButtonClass}>Save goal</button>
        </div>
      </form>
    )
  }

  if (!target) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <Target size={15} aria-hidden />
        Set a {year} reading goal
      </button>
    )
  }

  const progress = Math.min(1, completedThisYear / target)
  const status = pace(completedThisYear, target)

  return (
    <div className="mt-5 max-w-md flex items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-3">
      <svg
        role="progressbar"
        aria-label={`${year} reading goal`}
        aria-valuenow={completedThisYear}
        aria-valuemin={0}
        aria-valuemax={target}
        viewBox="0 0 52 52"
        className="shrink-0 -rotate-90"
        width={52}
        height={52}
      >
        <circle cx="26" cy="26" r={RING_RADIUS} fill="none" strokeWidth="5" className="stroke-neutral-200 dark:stroke-neutral-800" />
        <circle
          cx="26" cy="26" r={RING_RADIUS} fill="none" strokeWidth="5" strokeLinecap="round"
          stroke={user?.favColour || "#F13C3C"}
          strokeDasharray={`${progress * RING_LENGTH} ${RING_LENGTH}`}
          className="transition-[stroke-dasharray] duration-700"
        />
        <text x="26" y="26" dy="0.35em" textAnchor="middle" transform="rotate(90 26 26)" className="fill-foreground text-[11px] font-semibold tabular-nums">
          {Math.round(progress * 100)}%
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium tabular-nums">{completedThisYear} of {target} books in {year}</p>
        <p className={cn("mt-0.5 text-sm tabular-nums", toneClass[status.tone])}>{status.text}</p>
      </div>
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Edit ${year} reading goal`}
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <Pencil size={15} aria-hidden />
      </button>
    </div>
  )
}

export default ReadingGoalWidget
