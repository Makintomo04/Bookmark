"use client"
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { useForm } from 'react-hook-form'
import { BookOpen, Camera, Check, ChevronRight, Loader2, Target, Upload } from 'lucide-react'
import Loader from '@/app/components/Loader'
import { Button } from '@/app/components/ui/button'
import ColourSwatches from '@/app/components/profile/ColourSwatches'
import CommunityStep from '@/app/components/new-user/CommunityStep'
import useUser from '@/app/hooks/useUser'
import useImageUpload from '@/app/hooks/useImageUpload'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import { safeCallbackPath } from '@/lib/callbackUrl'
import { DEFAULT_COLOUR, USERNAME_MAX, USERNAME_MIN, suggestUsername } from '@/lib/profile'
import { BannerPresetId, defaultBannerPreset, bannerPresetValue } from '@/lib/banners'
import BannerPattern from '@/app/components/profile/BannerPattern'
import BannerPresetPicker from '@/app/components/profile/BannerPresetPicker'

// Three screens: the profile (username, colour and an optional photo), genres and profile visibility,
// then a few ways to start the shelf. The profile saves at the end of the first, so the
// rest are genuinely optional, and readers who arrived from somewhere (e.g. a reading circle invite) skip them
// and go straight back there.

type ProfileForm = { username: string; color: string; imageSrc: string; banner: BannerPresetId }
type Availability = "idle" | "checking" | "available" | "taken"

const fieldClass = "w-full h-10 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
const GOAL_PRESETS = [12, 24, 52]

type Step = 1 | 2 | 3
const STEPS: Step[] = [1, 2, 3]

const Progress = ({ step }: { step: Step }) => (
  <div className="mb-6 flex flex-col items-center gap-2">
    <div className="flex w-32 gap-1.5" aria-hidden>
      {STEPS.map((n) => <span key={n} className={cn("h-1 flex-1 rounded-full transition-colors", n <= step ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-700")} />)}
    </div>
    <p className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</p>
  </div>
)

const Page = () => {
  const { user, mutate } = useUser()
  const router = useRouter()
  const openBookEntry = useBookEntryModal((s) => s.onOpen)
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [nextPath, setNextPath] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability>("idle")
  const avatarInput = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, setValue, watch, setError, reset, formState: { errors } } = useForm<ProfileForm>({
    defaultValues: { username: "", color: DEFAULT_COLOUR, imageSrc: "", banner: "arches" },
  })
  const [username, colour, imageSrc, bannerPreset] = watch(["username", "color", "imageSrc", "banner"])
  const accent = colour || DEFAULT_COLOUR
  const avatar = useImageUpload((url) => setValue("imageSrc", url, { shouldDirty: true }))

  // Decided once, on the first load: a background refetch after saving must not bounce the reader off the later steps.
  const checked = useRef(false)
  useEffect(() => {
    if (!user || checked.current) return
    checked.current = true
    const callback = safeCallbackPath(new URLSearchParams(window.location.search).get("callbackUrl"), window.location.origin)
    setNextPath(callback)
    if (user.favColour) {
      router.replace(callback ?? "/")
      return
    }
    // Google and GitHub accounts arrive with a name and photo; start from those.
    // The banner starts on the same preset they'd get by default, so saving it is a choice they can see.
    reset({ username: suggestUsername(user), color: DEFAULT_COLOUR, imageSrc: user.image ?? "", banner: defaultBannerPreset(user.id) })
    setReady(true)
  }, [user, router, reset])

  // Debounced, and ignores replies to names the reader has since typed past.
  useEffect(() => {
    const name = username.trim()
    if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
      setAvailability("idle")
      return
    }
    setAvailability("checking")
    let current = true
    const timer = setTimeout(() => {
      axios.get(`/api/new-user?username=${encodeURIComponent(name)}`)
        .then((res) => { if (current) setAvailability(res.data?.available ? "available" : "taken") })
        .catch(() => { if (current) setAvailability("idle") })
    }, 350)
    return () => { current = false; clearTimeout(timer) }
  }, [username])

  const onSubmit = async (data: ProfileForm) => {
    if (availability === "taken") {
      setError("username", { type: "server", message: "That username is already taken." }, { shouldFocus: true })
      return
    }
    setSaving(true)
    try {
      const res = await axios.post("/api/new-user", { username: data.username.trim(), color: data.color, imageSrc: data.imageSrc || undefined, bannerSrc: bannerPresetValue(data.banner) })
      mutate(res.data, { revalidate: false })
      if (nextPath) {
        router.push(nextPath)
        return
      }
      setStep(2)
      window.scrollTo(0, 0)
    } catch (err) {
      const message = axios.isAxiosError(err) && err.response?.data?.error || "Couldn't save your profile. Check your connection and try again."
      if (axios.isAxiosError(err) && err.response?.data?.field === "username") {
        setError("username", { type: "server", message }, { shouldFocus: true })
      } else {
        notify.error(message)
      }
    }
    setSaving(false)
  }

  if (!ready) return <div className="h-screen w-full"><Loader /></div>

  const savedName = username.trim()
  const profileHref = `/u/${encodeURIComponent(savedName)}`
  const initial = (savedName[0] ?? "?").toUpperCase()
  const avatarSrc = avatar.preview || imageSrc
  const busy = saving || avatar.isUploading

  const usernameHint = errors.username
    ? <p id="username-hint" role="alert" className="text-sm text-danger">{errors.username.message}</p>
    : availability === "taken"
      ? <p id="username-hint" role="alert" className="text-sm text-danger">That username is already taken.</p>
      : availability === "available"
        ? <p id="username-hint" className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1 break-all"><Check size={14} aria-hidden /> Available · your profile will be /u/{savedName}</p>
        : <p id="username-hint" className="text-xs text-muted-foreground break-all">{availability === "checking" ? "Checking…" : `Your profile will be /u/${savedName || "…"}`}</p>

  const profileStep = (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <div className="text-center">
        <h1 className="page-title">Set up your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">This is how other readers see you. You can change it any time.</p>
      </div>

      {/* Live preview of the profile header, which doubles as the photo picker. */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-background">
        <div className="relative h-20 overflow-hidden transition-colors" style={{ background: accent }}>
          <BannerPattern preset={bannerPreset} colour={accent} />
        </div>
        <div className="flex items-end gap-3 px-4 pb-4">
          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            disabled={busy}
            aria-label={imageSrc ? "Change profile picture" : "Add a profile picture"}
            className="group relative -mt-6 size-16 shrink-0 overflow-hidden rounded-[22px] border-4 border-background grid place-items-center text-2xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ background: accent, color: readableInk(accent) }}
          >
            {avatarSrc ? <Image src={avatarSrc} alt="" fill sizes="64px" unoptimized={!!avatar.preview} className="object-cover" /> : <span aria-hidden>{initial}</span>}
            <span className={cn("absolute inset-0 grid place-items-center bg-black/45 text-white transition-opacity", avatar.isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
              {avatar.isUploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            </span>
          </button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            aria-label="Upload profile picture"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => { avatar.upload(e.target.files?.[0]); e.target.value = "" }}
          />
          <div className="min-w-0 pb-0.5 leading-tight">
            <p className="truncate font-semibold">{savedName || "your-name"}</p>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <button type="button" onClick={() => avatarInput.current?.click()} disabled={busy} className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60">
                {imageSrc ? "Change photo" : "Add a photo"}
              </button>
              {imageSrc ? (
                <button type="button" onClick={() => setValue("imageSrc", "")} disabled={busy} className="underline-offset-4 hover:underline disabled:opacity-60">Remove</button>
              ) : <span>optional</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-sm font-medium">Username</label>
        <input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. bookworm99"
          disabled={saving}
          aria-invalid={!!errors.username || availability === "taken"}
          aria-describedby="username-hint"
          className={cn(fieldClass, errors.username || availability === "taken" ? "border-danger" : "border-input")}
          {...register("username", {
            validate: (v) => {
              const t = v.trim()
              if (!t) return "Choose a username."
              if (t.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`
              if (t.length > USERNAME_MAX) return `Use ${USERNAME_MAX} characters or fewer.`
              return true
            },
          })}
        />
        {usernameHint}
      </div>

      <div className="flex flex-col gap-2">
        <span id="colour-label" className="text-sm font-medium">Your colour</span>
        <p className="-mt-1 text-xs text-muted-foreground">Tints your banner, your avatar until you add a photo, and your buttons.</p>
        <div className="mt-1">
          <ColourSwatches value={accent} onChange={(c) => setValue("color", c, { shouldDirty: true })} labelledBy="colour-label" disabled={saving} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id="banner-label" className="text-sm font-medium">Your banner</span>
        <p className="-mt-1 text-xs text-muted-foreground">A pattern in your colour. You can upload a photo later from your profile.</p>
        <div className="mt-1">
          <BannerPresetPicker value={bannerPreset} colour={accent} onChange={(id) => setValue("banner", id, { shouldDirty: true })} labelledBy="banner-label" disabled={saving} />
        </div>
      </div>

      <Button type="submit" disabled={busy || availability === "checking"} className="mt-2 rounded-md py-2">
        {saving ? "Saving…" : nextPath ? "Save and continue" : "Continue"}
      </Button>
    </form>
  )

  const shelfStep = (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="page-title break-words">Welcome, {savedName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your profile is ready. Put a few books on it so it feels like yours.</p>
      </div>
      <div className="flex flex-col gap-3">
        <ShelfOption
          icon={<BookOpen size={20} aria-hidden />}
          title="Add the book you're reading"
          description="Search by title or author."
          onClick={() => { openBookEntry(undefined, { shelf: "STARTED" }); router.push(profileHref) }}
        />
        <ShelfOption
          icon={<Upload size={20} aria-hidden />}
          title="Import from Goodreads or StoryGraph"
          description="Bring your shelves, ratings and dates in about a minute."
          onClick={() => router.push("/import")}
        />
        <GoalOption />
      </div>
      <Button type="button" onClick={() => router.push(profileHref)} variant="outline" className="rounded-md py-2 dark:border-neutral-100/50">
        Go to my profile
      </Button>
    </div>
  )

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background">
        <div className="flex min-h-screen w-full items-center justify-center sm:px-4 sm:py-10">
          <div className="min-h-screen w-full rounded-none bg-background p-6 pt-12 sm:min-h-0 sm:w-[560px] sm:rounded-xl sm:border sm:bg-popover sm:p-8">
            <div className="mb-4 flex justify-center">
              <Image src='/logo.svg' width={40} height={40} alt='Bookmark' />
            </div>
            {!nextPath && <Progress step={step} />}
            {step === 1 ? profileStep : step === 2 ? <CommunityStep onDone={() => { setStep(3); window.scrollTo(0, 0) }} /> : shelfStep}
          </div>
        </div>
    </div>
  )
}

const ShelfOption = ({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-center gap-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background p-4 text-left transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-text">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="block text-sm text-muted-foreground">{description}</span>
    </span>
    <ChevronRight size={18} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
  </button>
)

// Sets this year's goal in place, so it doesn't need a trip to another page.
const GoalOption = () => {
  const year = new Date().getFullYear()
  const [target, setTarget] = useState<number | null>(null)
  const [custom, setCustom] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const save = async (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 999) {
      setRangeError("Pick a goal between 1 and 999 books.")
      return
    }
    setRangeError(null)
    setTarget(value)
    setSaving(true)
    try {
      await axios.post("/api/reading-goal", { year, targetBooks: value })
      setSaved(value)
    } catch (err) {
      notify.error(apiError(err, "Couldn't save your goal. Try again."), { retry: () => save(value) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background p-4">
      <div className="flex items-center gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-text"><Target size={20} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p id="goal-label" className="font-medium">Set a {year} reading goal</p>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saved ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><Check size={14} aria-hidden /> {saved} books this year. Change it any time.</span> : "How many books this year?"}
          </p>
        </div>
      </div>
      <div role="group" aria-labelledby="goal-label" className="mt-3 flex flex-wrap items-center gap-2 pl-14">
        {GOAL_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => save(n)}
            disabled={saving}
            aria-pressed={saved === n}
            className={cn(
              "h-8 rounded-full border px-3 text-sm font-medium transition disabled:opacity-60",
              saved === n ? "border-brand-fill bg-brand-fill text-white" : "border-neutral-300 dark:border-neutral-700 hover:border-brand"
            )}
          >
            {saving && target === n ? <Loader2 size={14} className="animate-spin" aria-label="Saving" /> : n}
          </button>
        ))}
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); save(parseInt(custom, 10)) }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other"
            aria-label="Other goal"
            aria-invalid={!!rangeError}
            aria-describedby={rangeError ? "goal-error" : undefined}
            className="h-8 w-20 rounded-full border border-neutral-300 dark:border-neutral-700 bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {custom && <button type="submit" disabled={saving} className="h-8 rounded-full px-3 text-sm font-medium text-brand-text hover:underline">Set</button>}
        </form>
        {rangeError && <p id="goal-error" role="alert" className="w-full text-sm text-danger">{rangeError}</p>}
      </div>
    </div>
  )
}

export default Page
