"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { ArrowLeft, Lock } from 'lucide-react'
import { notify, apiError } from '@/lib/notify'
import { BIG_CLUB_MAX_MEMBERS, CLUB_ABOUT_MAX, CLUB_MAX_MEMBERS, CLUB_NAME_MAX } from '@/lib/clubs'
import useClubs from '@/app/hooks/useClubs'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import UpgradePrompt from '../plus/UpgradePrompt'

const inputClass = "w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const NewClubForm: FC = () => {
  const router = useRouter()
  const { hosting } = useClubs()
  const [name, setName] = useState("")
  const [about, setAbout] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const blocked = hosting !== null && !hosting.allowed

  const submit = () => {
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    axios.post("/api/clubs", { name, about }).then(({ data }) => {
      router.push(`/clubs/${data.id}`)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't start the club."))
      setIsSaving(false)
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Link href="/circles" className="-my-3 inline-flex w-fit items-center gap-1 py-3 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Reading circles
          </Link>
          <h1 className="page-title">Start a club</h1>
          <p className="max-w-prose text-muted-foreground">
            A club keeps the same readers from one book to the next. Share one link, and everyone who joins is added to each book you start. Up to {CLUB_MAX_MEMBERS} readers, or {BIG_CLUB_MAX_MEMBERS} if you have Plus.
          </p>
        </div>

        {blocked && hosting.upgrade && <UpgradePrompt feature="canHostUnlimited" message={hosting.message ?? undefined} />}
        {blocked && !hosting.upgrade && (
          <p className="flex items-start gap-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-sm">
            <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>{hosting.message}</span>
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="club-name" className="text-sm font-medium">Name</label>
          <input id="club-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CLUB_NAME_MAX} placeholder="Thursday Book Club" autoComplete="off" className={`${inputClass} h-10`} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="club-about" className="text-sm font-medium">About <span className="font-normal text-muted-foreground">(optional)</span></label>
          <textarea id="club-about" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={CLUB_ABOUT_MAX} rows={3} placeholder="Where you meet, what you like to read" className={`${inputClass} py-2`} />
          <p className="text-xs text-muted-foreground">Shown on the club page and its invite.</p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 dark:border-neutral-800 pt-6 sm:flex-row sm:justify-end">
        <Link href="/circles" className={secondaryButtonClass}>Cancel</Link>
        <button type="submit" disabled={!name.trim() || blocked || isSaving} className={primaryButtonClass}>
          {isSaving ? "Starting…" : "Start the club"}
        </button>
      </div>
    </form>
  )
}

export default NewClubForm
