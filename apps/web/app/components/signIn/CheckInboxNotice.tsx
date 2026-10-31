"use client"
import { useState } from 'react'
import axios from 'axios'
import { Button } from '../ui/button'

interface CheckInboxNoticeProps {
  email: string
  title?: string
}

// Shown after sign-up, and when a password sign-in is refused because the email isn't verified yet.
const CheckInboxNotice = ({ email, title = "Check your inbox" }: CheckInboxNoticeProps) => {
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null)
  const [sending, setSending] = useState(false)

  const resend = async () => {
    try {
      setSending(true)
      const res = await axios.post("/api/auth/resend-verification", { email })
      setStatus({ tone: "info", text: res.data?.message || "We've sent a new link." })
    } catch (error) {
      setStatus({ tone: "error", text: axios.isAxiosError(error) && error.response?.data?.error || "Couldn't send the link. Please try again." })
    } finally {
      setSending(false)
    }
  }

  return (
    <div role="status" className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-sm flex flex-col gap-3">
      <p className="font-semibold text-base">{title}</p>
      <p>We sent a link to <span className="font-semibold break-all">{email}</span>. Open it to confirm your email and you&apos;ll be signed in.</p>
      <p className="text-muted-foreground">The link expires in 24 hours. Can&apos;t find it? Check your spam folder or send a new one.</p>
      <Button type="button" onClick={resend} loading={sending} className="rounded-md py-2 self-start">
        {sending ? "Sending…" : "Resend link"}
      </Button>
      {status && <p className={status.tone === "error" ? "text-danger" : "text-muted-foreground"}>{status.text}</p>}
    </div>
  )
}

export default CheckInboxNotice
