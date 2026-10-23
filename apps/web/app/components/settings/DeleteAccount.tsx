"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { signOut } from 'next-auth/react'
import { notify } from '@/lib/notify'
import useUser from '@/app/hooks/useUser'
import { Button } from '../ui/button'

// Deleting needs the username typed back, so it can't happen from one stray click.
const DeleteAccount: FC = () => {
  const { user } = useUser()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  if (!user) return null

  const cancel = () => {
    setConfirming(false)
    setTyped("")
  }

  const handleDelete = () => {
    setIsDeleting(true)
    axios.delete("/api/user")
      .then(() => signOut({ callbackUrl: `${window.location.origin}/` }))
      .catch(() => {
        notify.error("Couldn't delete your account. Try again.", { retry: handleDelete })
        setIsDeleting(false)
      })
  }

  return (
    <div className="rounded-lg border border-danger/30 p-4">
      {!confirming ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Delete account</p>
            <p className="text-xs text-muted-foreground">Permanently remove your account, books, notes, goals and followers.</p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 border-danger/60 text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setConfirming(true)}>
            Delete account
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Delete your account for good?</p>
          <p className="text-xs text-muted-foreground">
            This can&apos;t be undone. Your shelf, notes, lists and the rest of your account go with it. Comments you posted in reading circles stay, shown as a former member&apos;s, and circles you host pass to the reader who&apos;s been in them longest. Type <span className="font-semibold text-foreground">{user.username}</span> to confirm.
          </p>
          <input
            autoFocus
            aria-label="Type your username to confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={isDeleting}
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full sm:max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={isDeleting || typed !== user.username} variant="destructive" onClick={handleDelete}>
              {isDeleting ? "Deleting…" : "Delete my account"}
            </Button>
            <Button type="button" variant="outline" disabled={isDeleting} onClick={cancel}>Keep my account</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeleteAccount
