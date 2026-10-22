"use client"
import { FC, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { useForm } from 'react-hook-form'
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { readableInk, toHex } from '@/lib/colour'
import { BIO_MAX, DEFAULT_COLOUR, USERNAME_MAX, USERNAME_MIN } from '@/lib/profile'
import { bannerPresetOf, bannerPresetValue, isBannerPresetValue, resolveBanner } from '@/lib/banners'
import BannerPattern from '../profile/BannerPattern'
import BannerPresetPicker from '../profile/BannerPresetPicker'
import useImageUpload from '@/app/hooks/useImageUpload'
import useUser from '@/app/hooks/useUser'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'
import InitialAvatar from '../profile/InitialAvatar'
import ColourSwatches from '../profile/ColourSwatches'

type ProfileForm = {
  username: string
  bio: string
  imageSrc: string
  bannerSrc: string
  color: string
}

const fieldClass = "w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
const overlayButtonClass = "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-black/60 text-white backdrop-blur-sm hover:bg-black/75 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"

const EditProfileModal: FC = () => {
  const { user, isLoading: isUserLoading, mutate } = useUser()
  const { isOpen, onClose } = useEditProfileModal()
  const [isSaving, setIsSaving] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, setValue, watch, setError, reset, formState: { errors, isDirty } } = useForm<ProfileForm>({
    defaultValues: { username: "", bio: "", imageSrc: "", bannerSrc: "", color: DEFAULT_COLOUR },
  })

  const setField = (name: keyof ProfileForm, value: string) =>
    setValue(name, value, { shouldDirty: true, shouldValidate: true })

  const avatar = useImageUpload((url) => setField("imageSrc", url))
  const banner = useImageUpload((url) => setField("bannerSrc", url))
  const isUploading = avatar.isUploading || banner.isUploading
  const isBusy = isSaving || isUploading

  // Start from the saved profile every time the modal opens, so abandoned edits don't linger.
  useEffect(() => {
    if (!isOpen || !user) return
    reset({
      username: user.username ?? "",
      bio: user.bio ?? "",
      imageSrc: user.image ?? "",
      bannerSrc: user.banner ?? "",
      color: toHex(user.favColour ?? "") ?? DEFAULT_COLOUR,
    })
  // Keyed on the id so a background refetch mid-edit doesn't wipe what the user typed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, reset])

  const [username, bio, imageSrc, bannerSrc, colour] = watch(["username", "bio", "imageSrc", "bannerSrc", "color"])
  const accent = colour || DEFAULT_COLOUR
  const accentInk = readableInk(accent)
  const avatarSrc = avatar.preview || imageSrc
  // An uploaded photo (or one mid-upload), a chosen preset, or the seeded default when the banner is empty.
  const bannerShown = banner.preview || resolveBanner(bannerSrc, user?.id ?? "")
  const bannerPreset = banner.preview ? null : bannerPresetOf(bannerShown)
  const hasBannerPhoto = !!bannerSrc && !isBannerPresetValue(bannerSrc)

  const close = () => {
    if (isBusy) return
    onClose()
  }

  const onSubmit = async (profile: ProfileForm) => {
    setIsSaving(true)
    try {
      const res = await axios.post("/api/user", { ...profile, username: profile.username.trim(), imageSrc: profile.imageSrc || null, bannerSrc: profile.bannerSrc || null })
      if (res.data?.id) mutate(res.data, { revalidate: false })
      onClose()
    } catch (err: any) {
      const message = err?.response?.data?.error
      if (err?.response?.status === 409) {
        setError("username", { type: "server", message: message || "That username is already taken." }, { shouldFocus: true })
      } else {
        notify.error(message || "Couldn't save your profile. Check your connection and try again.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const fileInput = (ref: typeof avatarInput, onFile: (f: File | undefined) => void, label: string) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      aria-label={label}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        onFile(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  const preview = (
    <div>
      <div className="relative h-32 sm:h-40 overflow-hidden rounded-xl transition-colors" style={{ background: accent }}>
        {bannerPreset
          ? <BannerPattern preset={bannerPreset} colour={accent} />
          : <Image src={bannerShown} alt="" fill sizes="(min-width: 768px) 800px, 100vw" unoptimized={!!banner.preview} className={cn("object-cover", banner.isUploading && "opacity-60")} />}
        {banner.isUploading && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-white drop-shadow" aria-hidden />
          </div>
        )}
        <div className="absolute right-3 top-3 flex gap-2">
          <button type="button" onClick={() => bannerInput.current?.click()} disabled={isBusy} className={overlayButtonClass}>
            <ImagePlus size={14} aria-hidden />{hasBannerPhoto ? "Change photo" : "Upload a photo"}
          </button>
          {hasBannerPhoto && !banner.isUploading && (
            <button type="button" onClick={() => setField("bannerSrc", "")} disabled={isBusy} aria-label="Remove banner photo" className={cn(overlayButtonClass, "px-2")}>
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
        {fileInput(bannerInput, banner.upload, "Upload banner image")}
      </div>

      <div className="px-4 -mt-10 sm:-mt-12 flex items-end gap-3">
        <button
          type="button"
          onClick={() => avatarInput.current?.click()}
          disabled={isBusy}
          aria-label={imageSrc ? "Change profile picture" : "Add profile picture"}
          className="group relative size-20 sm:size-24 shrink-0 overflow-hidden rounded-[28px] border-4 border-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ background: accent }}
        >
          {avatarSrc
            ? <Image src={avatarSrc} alt="" fill sizes="96px" unoptimized={!!avatar.preview} className="object-cover" />
            : <InitialAvatar username={username || user?.username} favColour={accent} />}
          <span className={cn(
            "absolute inset-0 grid place-items-center bg-black/45 text-white transition-opacity",
            avatar.isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          )}>
            {avatar.isUploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
          </span>
        </button>
        {fileInput(avatarInput, avatar.upload, "Upload profile picture")}
        <div className="pb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <button type="button" onClick={() => avatarInput.current?.click()} disabled={isBusy} className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60">
            {imageSrc ? "Change photo" : "Add photo"}
          </button>
          {imageSrc && !avatar.isUploading && (
            <button type="button" onClick={() => setField("imageSrc", "")} disabled={isBusy} className="underline-offset-4 hover:underline hover:text-foreground disabled:opacity-60">Remove</button>
          )}
          <span>JPG, PNG or GIF, up to 4MB</span>
        </div>
      </div>
    </div>
  )

  const fields = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-sm font-medium">Username</label>
        <input
          id="username"
          autoComplete="off"
          spellCheck={false}
          disabled={isSaving}
          aria-invalid={!!errors.username}
          aria-describedby="username-hint"
          className={cn(fieldClass, "h-10", errors.username ? "border-danger" : "border-input")}
          {...register("username", {
            validate: (v) => {
              const t = v.trim()
              if (t.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`
              if (t.length > USERNAME_MAX) return `Use ${USERNAME_MAX} characters or fewer.`
              return true
            },
          })}
        />
        {errors.username
          ? <p id="username-hint" role="alert" className="text-sm text-danger">{errors.username.message}</p>
          : <p id="username-hint" className="text-xs text-muted-foreground break-all">Your profile lives at /u/{username?.trim() || "…"}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="bio" className="text-sm font-medium">Bio <span className="font-normal text-muted-foreground">· optional</span></label>
          <span className={cn("text-xs tabular-nums", (bio?.length ?? 0) > BIO_MAX ? "text-danger" : "text-muted-foreground")} aria-live="polite">
            {bio?.length ?? 0}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id="bio"
          rows={3}
          disabled={isSaving}
          placeholder="What do you like to read?"
          aria-invalid={!!errors.bio}
          className={cn(fieldClass, "py-2 resize-y", errors.bio ? "border-danger" : "border-input")}
          {...register("bio", { maxLength: { value: BIO_MAX, message: `Keep your bio to ${BIO_MAX} characters.` } })}
        />
        {errors.bio && <p role="alert" className="text-sm text-danger">{errors.bio.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <span id="colour-label" className="text-sm font-medium">Colour</span>
        <p className="text-xs text-muted-foreground -mt-1">Fills your banner and avatar background, and tints your buttons.</p>
        <div className="mt-1">
          <ColourSwatches value={accent} onChange={(c) => setField("color", c)} labelledBy="colour-label" disabled={isSaving} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id="banner-label" className="text-sm font-medium">Banner</span>
        <p className="text-xs text-muted-foreground -mt-1">
          {hasBannerPhoto ? "Pick a pattern to replace your photo, in your colour." : "A pattern in your colour. Or upload a photo above."}
        </p>
        <div className="mt-1">
          <BannerPresetPicker value={bannerPreset} colour={accent} onChange={(id) => setField("bannerSrc", bannerPresetValue(id))} labelledBy="banner-label" disabled={isBusy} />
        </div>
      </div>
    </div>
  )


  const body = isUserLoading || !user ? (
    <div className="w-full px-6 self-start flex flex-col gap-4" aria-busy="true">
      <div className="h-32 sm:h-40 rounded-xl bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
      <div className="h-10 rounded-md bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
      <div className="h-20 rounded-md bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
    </div>
  ) : (
    <form
      id="edit-profile-form"
      onSubmit={handleSubmit(onSubmit)}
      className="w-full px-6 self-start flex flex-col gap-8 pb-2"
      noValidate
    >
      {preview}
      {fields}
      <p className="border-t pt-4 text-xs text-muted-foreground">
        Theme, privacy, Plus billing and your data are in{" "}
        <Link href="/settings" onClick={close} className="font-medium text-foreground underline-offset-4 hover:underline">Settings</Link>.
      </p>
    </form>
  )

  const saveLabel = isSaving ? "Saving…" : isUploading ? "Uploading…" : "Save changes"

  const footer = (
    <div className="w-full p-6 flex items-center justify-end gap-3">
      <Button type="button" variant="outline" onClick={close} disabled={isBusy} className="hidden sm:inline-flex">
        {isDirty ? "Cancel" : "Close"}
      </Button>
      <Button
        type="submit"
        form="edit-profile-form"
        disabled={!isDirty || isBusy}
        style={{ background: accent, color: accentInk }}
        className="transition-colors"
      >
        {saveLabel}
      </Button>
    </div>
  )

  return (
    <Modal
      title="Edit profile"
      body={body}
      footer={footer}
      onClose={close}
      isOpen={isOpen}
      disabled={isBusy}
      closeOnBackdrop={!isDirty}
      compact
    />
  )
}

export default EditProfileModal
