"use client"
import { FC, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Search, Users } from 'lucide-react'
import Modal from './Modal'
import useUser from '@/app/hooks/useUser'
import { UploadButton } from '@/utils/uploadthing'
import { notify, apiError } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import { Button } from '../ui/button'
import axios from 'axios'
import BookSearchResults, { BookSearchResult } from './BookSearchResults'
import useBookSearch from '@/app/hooks/useBookSearch'
import BookCover from '../cards/BookCover'
import StarRating from '../StarRating'
import { GENRES } from '@/utils/helpers'
import { readableInk } from '@/lib/colour'
import BookBlurb from '../books/BookBlurb'
import useBookDescription from '@/app/hooks/useBookDescription'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { celebrate } from '@/app/hooks/useEarnMoment'
import FormatPicker, { type FormatChoice, formatPayload } from '../books/FormatPicker'

type Shelf = "NOT_STARTED" | "STARTED" | "COMPLETED"

const SHELVES: { value: Shelf, label: string, action: string }[] = [
  { value: "NOT_STARTED", label: "Want to read", action: "Add to Want to read" },
  { value: "STARTED", label: "Reading", action: "Start reading" },
  { value: "COMPLETED", label: "Finished", action: "Add to Finished" },
]

const defaultValues = {
  title: "",
  author: "",
  pages: "",
  coverImgSrc: "",
  genre: "",
  currentPage: "",
  // Audiobooks: the running time and how far in the reader is, in minutes.
  hours: "",
  minutes: "",
  currentMinute: "",
  workKey: "",
  // Which Open Library edition the search hit was, so the catalog files this copy under it.
  editionKey: "",
  isbn13: "",
  isbn10: "",
}

const BookEntryModal: FC = () => {
  const { user } = useUser()
  const router = useRouter()
  const bookEntryModal = useBookEntryModal()
  const [isLoading, setIsLoading] = useState(false)
  // Print by default; an audiobook logs minutes listened instead of pages.
  const [format, setFormat] = useState<FormatChoice>("PRINT")
  // "Start a circle for this book": after adding, go straight to the new-circle form with it chosen.
  const [startCircle, setStartCircle] = useState(false)
  // Private: on the reader's shelf as usual, but left off their profile and out of followers' feeds.
  const [isPrivate, setIsPrivate] = useState(false)

  // "search" until a book is picked (or the user opts to type one in), then "shelf".
  const [stage, setStage] = useState<"search" | "shelf">("search")
  const [isEditing, setIsEditing] = useState(false)
  const [shelf, setShelf] = useState<Shelf>("NOT_STARTED")
  const [finishedThisYear, setFinishedThisYear] = useState(false)
  const [rating, setRating] = useState(0)

  const [query, setQuery] = useState("")
  const [searchAttempt, setSearchAttempt] = useState(0)
  const { results: searchResults, isSearching, searchFailed } = useBookSearch(query, { enabled: stage === "search", attempt: searchAttempt })

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<FieldValues>({ defaultValues })
  const [title, author, pages, coverImgSrc, workKey, hours, minutes] = watch(["title", "author", "pages", "coverImgSrc", "workKey", "hours", "minutes"])
  const isAudio = format === "AUDIOBOOK"
  const runningTime = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0)
  const lengthText = isAudio
    ? runningTime > 0 && `${hours ? `${parseInt(hours)}h` : ""}${minutes ? ` ${parseInt(minutes)}m` : ""}`.trim()
    : pages && `${pages} pages`
  const year = new Date().getFullYear()
  const [published, setPublished] = useState<number | null>(null)
  // A Hardcover hit brings its own blurb; it has no Open Library work to fetch one from.
  const [givenBlurb, setGivenBlurb] = useState<string | null>(null)
  // And its Hardcover id, which files it in the catalogue so it gets a book page.
  const [hardcoverId, setHardcoverId] = useState<string | null>(null)
  const { description, isLoading: isDescriptionLoading } = useBookDescription(stage === "shelf" ? workKey : null, stage === "shelf" ? givenBlurb : null)

  const resetAll = () => {
    reset(defaultValues)
    setStage("search")
    setIsEditing(false)
    setFormat("PRINT")
    setStartCircle(false)
    setIsPrivate(false)
    setShelf("NOT_STARTED")
    setFinishedThisYear(false)
    setRating(0)
    setPublished(null)
    setGivenBlurb(null)
    setHardcoverId(null)
    setQuery("")
  }

  useEffect(() => {
    if (!bookEntryModal.isOpen) {
      resetAll()
      return
    }
    const startShelf = bookEntryModal.shelf ?? "NOT_STARTED"
    setShelf(startShelf)
    setStartCircle(bookEntryModal.startCircle)
    // Opened from Discover with a book already chosen: skip straight to picking a shelf.
    if (bookEntryModal.prefill) handleSelect(bookEntryModal.prefill, startShelf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookEntryModal.isOpen])

  const handleSelect = (result: BookSearchResult, onShelf: Shelf = shelf) => {
    reset({
      ...defaultValues,
      title: result.title,
      author: result.author,
      pages: result.pages ? String(result.pages) : "",
      coverImgSrc: result.coverUrl || "",
      workKey: result.workKey || "",
      editionKey: result.editionKey || "",
      isbn13: result.isbn13 || "",
      isbn10: result.isbn10 || "",
    })
    setPublished(result.year ?? null)
    setGivenBlurb(result.description ?? null)
    setHardcoverId(result.hardcoverId ?? null)
    setFormat("PRINT")
    // Open Library doesn't always know the page count. Only progress needs it, so ask only when starting.
    setIsEditing(!result.pages && onShelf === "STARTED")
    setStage("shelf")
  }

  const chooseShelf = (next: Shelf) => {
    setShelf(next)
    if (next === "STARTED" && !isAudio && !(parseInt(pages) > 0)) setIsEditing(true)
  }

  // Switching to Audiobook opens the details so the running time can be typed; it's required.
  const chooseFormat = (next: FormatChoice) => {
    setFormat(next)
    if (next === "AUDIOBOOK") setIsEditing(true)
  }

  const handleAddManually = () => {
    reset({ ...defaultValues, title: query.trim() })
    setPublished(null)
    setGivenBlurb(null)
    setHardcoverId(null)
    setIsEditing(true)
    setStage("shelf")
  }

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    if (isAudio && runningTime <= 0) {
      setIsEditing(true)
      notify.error("Enter the audiobook's running time")
      return
    }
    setIsLoading(true)
    axios.post("/api/books", {
      title: data.title,
      author: data.author,
      pages: data.pages || undefined,
      ...formatPayload(format, runningTime),
      currentMinute: isAudio && shelf === "STARTED" ? data.currentMinute : undefined,
      coverImgSrc: data.coverImgSrc,
      genre: data.genre,
      workKey: data.workKey || undefined,
      editionKey: data.editionKey || undefined,
      isbn13: data.isbn13 || undefined,
      isbn10: data.isbn10 || undefined,
      hardcoverId: hardcoverId || undefined,
      description: description || undefined,
      status: shelf,
      currentPage: shelf === "STARTED" ? data.currentPage : undefined,
      finishedThisYear: shelf === "COMPLETED" ? finishedThisYear : undefined,
      rating: shelf === "COMPLETED" && rating > 0 ? rating : undefined,
      isPrivate: isPrivate || undefined,
    }).then(({ data: saved }) => {
      const label = SHELVES.find((s) => s.value === shelf)?.label
      celebrate(saved?.earnMoment, { message: isPrivate ? `Added to ${label}, privately` : `Added to ${label}` })
      refreshAfterBookChange()
      copyCoverLater(saved?.id)
      bookEntryModal.onClose()
      if (startCircle && saved?.id && shelf !== "COMPLETED") router.push(`/circles/new?bookId=${saved.id}`)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't add that book. Try again."))
    }).finally(() => setIsLoading(false))
  }

  // Details are collapsed behind "Edit details"; open them if one of them is what's invalid.
  const onInvalid = () => setIsEditing(true)

  const searchBody = (
    <div className="w-full h-full px-6 self-start">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or author"
          aria-label="Search for a book"
          autoComplete="off"
          className="flex h-12 w-full rounded-md border border-input bg-background pl-10 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div className="mt-3">
        {query.trim().length < 3 ? (
          <p className="text-sm text-muted-foreground px-1">Type at least 3 characters to search.</p>
        ) : (
          <BookSearchResults results={searchResults} isLoading={isSearching} onSelect={handleSelect} failed={searchFailed} onRetry={() => setSearchAttempt((n) => n + 1)} />
        )}
      </div>
      <button type="button" onClick={handleAddManually} className="mt-4 px-1 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
        Can&apos;t find it? Add it manually
      </button>
    </div>
  )

  const shelfBody = (
    <div className="w-full h-full px-6 self-start flex flex-col gap-6">
      <div className="flex gap-4 items-start">
        <BookCover
          book={{ title: title || "Untitled", author, coverImage: coverImgSrc, cardColour: null }}
          sizes="72px"
          variant="thumb"
          className="w-[72px] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight break-words">{title || "Untitled"}</p>
          <p className="text-sm text-muted-foreground">
            {[author || "Unknown author", published, lengthText].filter(Boolean).join(" · ")}
          </p>
          <div className="flex gap-4 mt-2 text-sm">
            <button type="button" onClick={() => setIsEditing((v) => !v)} className="underline underline-offset-4 text-muted-foreground hover:text-foreground">
              {isEditing ? "Hide details" : "Edit details"}
            </button>
            <button type="button" onClick={() => setStage("search")} className="underline underline-offset-4 text-muted-foreground hover:text-foreground">
              Change book
            </button>
          </div>
        </div>
      </div>

      <BookBlurb description={description} isLoading={isDescriptionLoading} />

      <FormatPicker value={format} onChange={chooseFormat} disabled={isLoading} />

      {/* Kept mounted while hidden so validation still runs on these fields. */}
      <div className={cn("grid sm:grid-cols-2 gap-4", !isEditing && "hidden")}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input register={register} errors={errors} inputValidation={{ required: true, message: "Enter a title" }} name="title" id="title" autoComplete="off" disabled={isLoading} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="author">Author</Label>
          <Input register={register} errors={errors} inputValidation={{ required: true, message: "Enter an author" }} name="author" id="author" autoComplete="off" disabled={isLoading} />
        </div>
        {isAudio ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="hours">Running time</Label>
            <div className="flex items-center gap-2">
              <Input register={register} errors={errors} type="number" min={0} name="hours" id="hours" placeholder="0" autoComplete="off" className="w-[72px]" disabled={isLoading} />
              <span className="text-sm text-muted-foreground">h</span>
              <Input register={register} errors={errors} type="number" min={0} max={59} name="minutes" id="minutes" placeholder="00" autoComplete="off" className="w-[72px]" disabled={isLoading} />
              <span className="text-sm text-muted-foreground">m</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pages">Total pages {shelf !== "STARTED" && <span className="font-normal text-muted-foreground">· optional</span>}</Label>
            <Input register={register} errors={errors} inputValidation={{
              validate: (v: string) => v ? parseInt(v) >= 1 || "Enter the number of pages"
                : shelf !== "STARTED" || "Enter the number of pages to track your progress",
            }} type="number" min={1} name="pages" id="pages" autoComplete="off" className="w-[120px]" disabled={isLoading} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="genre">Genre <span className="font-normal text-muted-foreground">· optional</span></Label>
          <Input register={register} errors={errors} name="genre" id="genre" list="genre-options" autoComplete="off" placeholder="Fantasy" disabled={isLoading} />
          <datalist id="genre-options">
            {GENRES.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Cover <span className="font-normal text-muted-foreground">· optional</span></Label>
          <UploadButton
            appearance={{ button: () => ({ background: user?.favColour || '#D92D2D', color: readableInk(user?.favColour || '#D92D2D') }) }}
            className="items-start"
            endpoint="imageUploader"
            onUploadBegin={() => setIsLoading(true)}
            onClientUploadComplete={(res) => {
              setValue("coverImgSrc", res[0]?.url)
              setIsLoading(false)
            }}
            onUploadError={(error: Error) => {
              notify.error(error.message || "Upload failed. Try another image.")
              setIsLoading(false)
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Label id="shelf-label">Add to</Label>
        <div role="radiogroup" aria-labelledby="shelf-label" className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1">
          {SHELVES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={shelf === s.value}
              onClick={() => chooseShelf(s.value)}
              className={cn(
                "rounded-md py-2 text-sm transition",
                shelf === s.value
                  ? "bg-background font-semibold shadow-sm ring-1 ring-neutral-300 dark:ring-neutral-700"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPrivate}
          onClick={() => setIsPrivate((v) => !v)}
          disabled={isLoading}
          className="flex items-start gap-3 text-left w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span
            className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", !isPrivate && "bg-neutral-300 dark:bg-neutral-700")}
            style={isPrivate ? { background: user?.favColour || "#D92D2D" } : undefined}
          >
            <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", isPrivate && "translate-x-5")} />
          </span>
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium"><Lock size={14} aria-hidden /> Keep it private</span>
            <span className="block text-sm text-muted-foreground">It stays off your profile and out of your followers&apos; feeds. You can share it later.</span>
          </span>
        </button>
      </div>

      {shelf === "STARTED" && !isAudio && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPage">Current page <span className="font-normal text-muted-foreground">· optional</span></Label>
          <div className="flex items-center gap-2">
            <Input register={register} errors={errors} type="number" min={0} name="currentPage" id="currentPage" placeholder="0" autoComplete="off" className="w-[120px]" disabled={isLoading} />
            {pages && <span className="text-sm text-muted-foreground">of {pages}</span>}
          </div>
        </div>
      )}
      {shelf === "STARTED" && isAudio && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentMinute">Minutes listened so far <span className="font-normal text-muted-foreground">· optional</span></Label>
          <div className="flex items-center gap-2">
            <Input register={register} errors={errors} type="number" min={0} name="currentMinute" id="currentMinute" placeholder="0" autoComplete="off" className="w-[120px]" disabled={isLoading} />
            {runningTime > 0 && <span className="text-sm text-muted-foreground">of {runningTime}</span>}
          </div>
        </div>
      )}

      {shelf !== "COMPLETED" && (
        <button
          type="button"
          role="switch"
          aria-checked={startCircle}
          onClick={() => setStartCircle((v) => !v)}
          disabled={isLoading}
          className="flex items-start gap-3 text-left w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span
            className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", !startCircle && "bg-neutral-300 dark:bg-neutral-700")}
            style={startCircle ? { background: user?.favColour || "#D92D2D" } : undefined}
          >
            <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", startCircle && "translate-x-5")} />
          </span>
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium"><Users size={14} aria-hidden /> Start a reading circle for this book</span>
            <span className="block text-sm text-muted-foreground">Read it with friends: you&apos;ll get an invite link right after adding it.</span>
          </span>
        </button>
      )}

      {shelf === "COMPLETED" && (
        <div className="flex flex-col gap-5">
          <button
            type="button"
            role="switch"
            aria-checked={finishedThisYear}
            onClick={() => setFinishedThisYear((v) => !v)}
            className="flex items-start gap-3 text-left w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span
              className={cn(
                "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
                !finishedThisYear && "bg-neutral-300 dark:bg-neutral-700"
              )}
              style={finishedThisYear ? { background: user?.favColour || "#7c3aed" } : undefined}
            >
              <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", finishedThisYear && "translate-x-5")} />
            </span>
            <span>
              <span className="block text-sm font-medium">I finished this in {year}</span>
              <span className="block text-sm text-muted-foreground">Counts toward your {year} reading goal.</span>
            </span>
          </button>
          <div className="flex flex-col gap-2">
            <Label>Rating <span className="font-normal text-muted-foreground">· optional</span></Label>
            <StarRating value={rating} onChange={setRating} disabled={isLoading} />
          </div>
        </div>
      )}
    </div>
  )

  const footer = (
    <div className="w-full h-full mt-auto p-6">
      <div className="flex items-center gap-3 justify-end mt-auto">
        <Button onClick={bookEntryModal.onClose} variant="outline" className="border-neutral-700 rounded-md py-2" disabled={isLoading}>Cancel</Button>
        {stage === "shelf" && (
          <Button style={{ background: user?.favColour || '#D92D2D', color: readableInk(user?.favColour || '#D92D2D') }} onClick={handleSubmit(onSubmit, onInvalid)} disabled={isLoading}>
            {SHELVES.find((s) => s.value === shelf)?.action}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Modal
      title="Add a book"
      body={stage === "search" ? searchBody : shelfBody}
      footer={footer}
      onClose={bookEntryModal.onClose}
      isOpen={bookEntryModal.isOpen}
      disabled={isLoading}
    />
  )
}

export default BookEntryModal
