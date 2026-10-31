"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Pencil, Crown, Target } from 'lucide-react'
import useReadingGoal from '@/app/hooks/useReadingGoal'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { entitlementsOf, isUpgradeRequired } from '@/lib/entitlements'
import { GOAL_MONTHLY_MAX, GOAL_PAGES_MAX, monthTarget } from '@/lib/goals'
import { streakText } from '@bookmark/shared/goals'
import { Input as RawInput } from '../ui/input'
import { Skeleton } from '../ui/skeleton'
import UpgradePrompt from '../plus/UpgradePrompt'
import { useForm, FieldValues, SubmitHandler } from 'react-hook-form'
import { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'
import { useRemindersPrompt } from '@/app/hooks/useEarnMoment'

const RING_RADIUS = 22
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = (n: number) => n.toLocaleString('en-GB')

// Where the pace says you should be by now. It runs from 1 January, or from the day the goal was set if that was
// later, starting from the books already read by then: so a reader who joins in October isn't told they're ten
// behind on day one, and one who sets a goal with 150 read isn't told they're 150 ahead.
const expectedBooks = (year: number, target: number, setAt?: string | Date | null, before = 0) => {
  const yearStart = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  const start = Math.min(end, Math.max(yearStart, setAt ? new Date(setAt).getTime() : yearStart))
  const from = start > yearStart ? Math.min(before, target) : 0
  const fraction = start >= end ? 1 : Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
  return from + (target - from) * fraction
}

const pace = (completed: number, target: number, expected: number) => {
  const left = target - completed
  if (left <= 0) return { text: completed > target ? `Goal smashed · ${completed - target} over` : "Goal reached", toGo: null, tone: "good" as const }
  const diff = Math.round(completed - expected)
  // "to go" is kept apart: a phone drops it to fit this month on the same line.
  const toGo = `${left} to go`
  if (diff > 0) return { text: `${diff} ahead of pace`, toGo, tone: "good" as const }
  if (diff < 0) return { text: `${-diff} behind pace`, toGo, tone: "behind" as const }
  return { text: "On pace", toGo, tone: "neutral" as const }
}

const toneClass = {
  good: "text-emerald-600 dark:text-emerald-400",
  behind: "text-amber-600 dark:text-amber-400",
  neutral: "text-muted-foreground",
}

// "" clears a Plus goal; a number sets it.
const extraValue = (raw: unknown) => (raw === "" || raw === undefined || raw === null ? null : Number(raw))

// One thin bar under the yearly ring: the monthly pace (everyone) or the page goal (Plus).
// One thin bar beside the yearly ring: this month (everyone) or the page goal (Plus). Said in words, not as
// "9 of 12": what's done above the bar, what's left (or that it's met) under it.
const ExtraGoal: FC<{ label: string; done: string; value: number; target: number; note: string; colour: string }> = ({ label, done, value, target, note, colour }) => (
  <div>
    <div className="flex items-baseline justify-between gap-2 text-[11px] leading-none">
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">{done}</span>
    </div>
    <div role="progressbar" aria-label={`${label}: ${done}. ${note}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)} className="mt-1 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (value / target) * 100)}%`, background: colour }} />
    </div>
    <p className={cn("mt-1 text-[11px] leading-none tabular-nums", value >= target ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{note}</p>
  </div>
)

// This month in words. The pace target is what each month needs from here to reach the year's goal; a Plus
// reader's own monthly target is just that.
const monthNote = (done: number, perMonth: number, custom: boolean, yearTarget: number) => {
  const left = perMonth - done
  if (custom) return left > 0 ? `${fmt(left)} more to hit your ${fmt(perMonth)}` : `Hit your ${fmt(perMonth)} this month`
  return left > 0 ? `${fmt(left)} more to stay on track for ${fmt(yearTarget)}` : `On track for ${fmt(yearTarget)}`
}

// The average star rating of the books finished this year, or null with none rated.
const averageRating = (books: Book[] | undefined, year: number) => {
  const rated = (books ?? []).filter((b) => b.status === "COMPLETED" && b.rating && b.completedAt && new Date(b.completedAt).getFullYear() === year)
  if (rated.length === 0) return null
  return rated.reduce((sum, b) => sum + (b.rating ?? 0), 0) / rated.length
}

interface ReadingGoalWidgetProps {
  // "strip": one slim line under the header (the profile as it has been).
  // "block": two lines in the column beside your books, in bands from lg up.
  // "lines": the same two lines in words under the stats, with no card, in bands below lg.
  variant?: 'strip' | 'block' | 'lines'
}

// The most books a month the goal can ask you to catch up with before it suggests changing the goal instead.
const CATCH_UP_MAX = 4

// The goal's shape while it loads, the same size as each variant, so the header doesn't grow when it lands.
const GoalSkeleton: FC<{ variant: NonNullable<ReadingGoalWidgetProps['variant']> }> = ({ variant }) => {
  if (variant === 'block') {
    return (
      <div aria-hidden className="mt-5 flex items-start gap-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 p-3.5">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="mt-3 h-3 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    )
  }
  if (variant === 'lines') {
    return (
      <div aria-hidden className="mt-3 flex flex-col gap-1.5 py-0.5">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    )
  }
  return (
    <div aria-hidden className="mt-4 flex items-center gap-x-3 rounded-xl border border-neutral-200 dark:border-neutral-800 py-2 pl-2.5 pr-1.5">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="h-[34px]" />
    </div>
  )
}

const ReadingGoalWidget: FC<ReadingGoalWidgetProps> = ({ variant = 'strip' }) => {
  const { user } = useUser()
  const { books } = useBooks()
  const year = new Date().getFullYear()
  const { goal, progress: counted, isLoading, mutate } = useReadingGoal(year)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [refused, setRefused] = useState(false)
  const canExtra = entitlementsOf(user ?? {}).extraGoalTypes

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FieldValues>({
    defaultValues: { targetBooks: 12, targetPages: "", targetBooksPerMonth: "" },
  })

  // Counted on the server from finished reads, as /stats counts them. Nothing yet reads as nothing finished.
  const progress = counted ?? { books: 0, pages: 0, thisMonth: 0, month: new Date().getMonth() }
  const completedThisYear = progress.books
  // Their streak under the goal, so "ends tonight" is in sight before the evening alert.
  const streakLine = streakText(counted?.streak)

  const startEditing = () => {
    reset({
      targetBooks: goal?.targetBooks || 12,
      targetPages: goal?.targetPages ?? "",
      targetBooksPerMonth: goal?.targetBooksPerMonth ?? "",
    })
    setRefused(false)
    setIsEditing(true)
  }

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsSaving(true)
    // A free account only sends the book count, so a goal set while on Plus stays put.
    const extras = canExtra ? { targetPages: extraValue(data.targetPages), targetBooksPerMonth: extraValue(data.targetBooksPerMonth) } : {}
    axios.post("/api/reading-goal", { year, targetBooks: data.targetBooks, ...extras })
      .then((res) => {
        mutate()
        setIsEditing(false)
        // Setting a goal is one of the moments reminders are offered, once.
        if (res.data?.askReminders) useRemindersPrompt.getState().ask(res.data.askReminders)
      })
      .catch((err) => {
        if (isUpgradeRequired(err?.response?.data)) return setRefused(true)
        notify.error(apiError(err, "Couldn't save your goal. Try again."), { retry: () => onSubmit(data) })
      })
      .finally(() => setIsSaving(false))
  }

  if (isLoading) return <GoalSkeleton variant={variant} />

  const target = goal?.targetBooks
  const colour = user?.favColour || "#F13C3C"
  const fieldClass = "h-9"

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <label htmlFor="targetBooks" className="block text-sm font-medium">How many books do you want to read in {year}?</label>
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <div className="w-20">
            <RawInput register={register} errors={errors} inputValidation={{ required: true, min: 1, message: "Enter a goal" }} name="targetBooks" id="targetBooks" type="number" min={1} autoComplete="off" autoFocus className={fieldClass} disabled={isSaving} />
          </div>
          <span className="self-center text-sm text-muted-foreground">books</span>
        </div>

        {canExtra ? (
          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Crown size={14} aria-hidden className="text-brand" /> Plus goals <span className="font-normal text-muted-foreground">· optional</span>
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-28">
                <RawInput register={register} errors={errors} inputValidation={{ min: 1, max: GOAL_PAGES_MAX, message: `1 to ${fmt(GOAL_PAGES_MAX)}` }} name="targetPages" id="targetPages" type="number" min={1} max={GOAL_PAGES_MAX} placeholder="e.g. 10000" autoComplete="off" className={fieldClass} disabled={isSaving} />
              </div>
              <label htmlFor="targetPages" className="text-sm text-muted-foreground">pages in {year}</label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-20">
                <RawInput register={register} errors={errors} inputValidation={{ min: 1, max: GOAL_MONTHLY_MAX, message: `1 to ${GOAL_MONTHLY_MAX}` }} name="targetBooksPerMonth" id="targetBooksPerMonth" type="number" min={1} max={GOAL_MONTHLY_MAX} placeholder="e.g. 3" autoComplete="off" className={fieldClass} disabled={isSaving} />
              </div>
              <label htmlFor="targetBooksPerMonth" className="text-sm text-muted-foreground">books every month</label>
            </div>
            <p className="text-xs text-muted-foreground">Leave one empty to turn it off. Without a monthly target, your pace comes from your yearly goal.</p>
          </fieldset>
        ) : (
          <UpgradePrompt feature="extraGoalTypes" variant="inline" message="Want a page goal or your own monthly target? They're part of Plus." className="mt-3 block" />
        )}
        {refused && <UpgradePrompt feature="extraGoalTypes" className="mt-3" />}

        <div className="mt-4 flex justify-end gap-2">
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
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-neutral-400 dark:hover:border-neutral-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Target size={15} aria-hidden />
        Set a {year} reading goal
      </button>
    )
  }

  const ratio = Math.min(1, completedThisYear / target)
  const expected = expectedBooks(year, target, goal?.createdAt, counted?.beforeGoal)
  const status = pace(completedThisYear, target, expected)
  // The page goal shows while on Plus; a lapsed account keeps it for when it comes back. The monthly
  // target is a stat everyone gets: whole books this month to stay on track, or the Plus custom target.
  const pagesTarget = canExtra ? goal?.targetPages : null
  const monthGoal = monthTarget(goal, progress.books - progress.thisMonth, progress.month, canExtra)
  const month = MONTHS[progress.month]
  const average = averageRating(books as Book[] | undefined, year)
  const ring = (size: number) => (
    <svg
      role="progressbar"
      aria-label={`${year} reading goal`}
      aria-valuenow={completedThisYear}
      aria-valuemin={0}
      aria-valuemax={target}
      viewBox="0 0 52 52"
      className="shrink-0 -rotate-90"
      width={size}
      height={size}
    >
      <circle cx="26" cy="26" r={RING_RADIUS} fill="none" strokeWidth="6" className="stroke-neutral-200 dark:stroke-neutral-800" />
      <circle
        cx="26" cy="26" r={RING_RADIUS} fill="none" strokeWidth="6" strokeLinecap="round"
        stroke={colour}
        strokeDasharray={`${ratio * RING_LENGTH} ${RING_LENGTH}`}
        className="transition-[stroke-dasharray] duration-700"
      />
      <text x="26" y="26" dy="0.35em" textAnchor="middle" transform="rotate(90 26 26)" className="fill-foreground text-[13px] font-semibold tabular-nums">
        {Math.round(ratio * 100)}
      </text>
    </svg>
  )
  const editButton = (
    <button
      type="button"
      onClick={startEditing}
      aria-label={`Edit ${year} reading goal`}
      className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Pencil size={15} aria-hidden />
    </button>
  )

  // In bands the goal is said in two lines. The first has at most one coloured word: amber when behind,
  // green when ahead, so "behind" never sits beside a green "hit your target". It ends with what to do
  // next: the books that put you back on pace this month, or (when that's more than CATCH_UP_MAX) a nudge
  // to change the goal. The second is grey: this month, your page goal and your average rating.
  const gap = Math.round(completedThisYear - expected)
  const token = completedThisYear >= target
    ? <span className={toneClass.good}>{completedThisYear > target ? `${completedThisYear - target} over` : "goal reached"}</span>
    : gap < 0 ? <span className={toneClass.behind}>{-gap} behind</span>
    : gap > 0 ? <span className={toneClass.good}>{gap} ahead</span>
    : <span className="text-muted-foreground">on pace</span>
  const nextStep = completedThisYear >= target ? null
    : gap >= 0 ? `On track for ${fmt(target)}`
    : -gap > CATCH_UP_MAX ? <button type="button" onClick={startEditing} className="underline underline-offset-2 hover:text-foreground">Adjust your goal</button>
    : `Read ${fmt(-gap)} more this month to catch up`
  const second = [
    `${month}: ${fmt(progress.thisMonth)} read`,
    pagesTarget ? `${fmt(progress.pages)} of ${fmt(pagesTarget)} pages` : null,
    average !== null ? `${average.toFixed(1)} ★ average` : null,
  ].filter(Boolean).join(" · ")
  const twoLines = (
    <div className="flex items-start gap-3">
      {ring(40)}
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-sm font-medium tabular-nums">{fmt(completedThisYear)} of {fmt(target)} in {year} · {token}</p>
        {nextStep && <p className="text-xs text-muted-foreground">{nextStep}</p>}
        <p className="mt-2 border-t border-neutral-200 dark:border-neutral-800 pt-2 text-xs tabular-nums text-muted-foreground">{second}</p>
      </div>
      <div className="-mr-2 -mt-1.5">{editButton}</div>
    </div>
  )

  if (variant === 'block') {
    return <section aria-label={`${year} reading goal`} className="mt-5 rounded-xl bg-neutral-100 dark:bg-neutral-900 p-3.5">{twoLines}</section>
  }
  if (variant === 'lines') {
    return (
      <section aria-label={`${year} reading goal`} className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1 leading-snug">
          <p className="text-sm tabular-nums"><span className="font-medium">{fmt(completedThisYear)} of {fmt(target)}</span> · {token}{nextStep && <span className="text-muted-foreground"> · {nextStep}</span>}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{second}</p>
          {streakLine && <p className="text-xs tabular-nums text-muted-foreground">{streakLine}</p>}
        </div>
        <div className="-mr-2 -mt-1.5">{editButton}</div>
      </section>
    )
  }

  const yearLine = (
    <>
      <span className="flex items-center gap-1 text-sm font-medium tabular-nums">
        <span className="truncate">{completedThisYear} of {target} books in {year}</span>
      </span>
      <span className="block truncate text-xs tabular-nums">
        <span className={toneClass[status.tone]}>{status.text}{status.toGo && <span className="hidden sm:inline"> · {status.toGo}</span>}</span>
        {monthGoal.perMonth > 0 && (
          <span className="text-muted-foreground sm:hidden"> · {monthGoal.perMonth > progress.thisMonth ? `${fmt(monthGoal.perMonth - progress.thisMonth)} more this month` : "on track this month"}</span>
        )}
      </span>
      {streakLine && <span className="block truncate text-xs tabular-nums text-muted-foreground">{streakLine}</span>}
    </>
  )

  // One slim strip: the ring, the year in words, and this month (and pages, on Plus) as small bars on the
  // right. On a phone the month drops into the second line instead.
  return (
    <section aria-label={`${year} reading goal`} className="mt-4 flex items-center gap-x-3 rounded-xl border border-neutral-200 dark:border-neutral-800 py-2 pl-2.5 pr-1.5">
      {ring(36)}
      <div className="min-w-0 flex-1 leading-tight">{yearLine}</div>
      <div className="hidden sm:flex shrink-0 flex-col gap-2.5 w-52">
        {monthGoal.perMonth > 0 && (
          <ExtraGoal label={month} done={`${fmt(progress.thisMonth)} read`} value={progress.thisMonth} target={monthGoal.perMonth}
            note={monthNote(progress.thisMonth, monthGoal.perMonth, monthGoal.custom, target)} colour={colour} />
        )}
        {pagesTarget ? (
          <ExtraGoal label={`Pages in ${year}`} done={`${fmt(progress.pages)} read`} value={progress.pages} target={pagesTarget}
            note={progress.pages >= pagesTarget ? `Reached your ${fmt(pagesTarget)}` : `${fmt(pagesTarget - progress.pages)} more to reach ${fmt(pagesTarget)}`} colour={colour} />
        ) : null}
      </div>
      {editButton}
    </section>
  )
}

export default ReadingGoalWidget
