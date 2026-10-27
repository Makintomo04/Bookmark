"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { Flag } from 'lucide-react'
import { notify } from '@/lib/notify'
import useUser from '@/app/hooks/useUser'
import { REVIEW_REPORT_REASONS } from '@/lib/reviewReports'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu'

// Report someone's review, like ReportListButton: pick a reason and it's sent to the Bookmark team.
// `bookId` is the reviewer's copy of the book, where the review lives. Signed-in readers only; the server
// also refuses your own review and any you can't see.
const ReportReviewButton: FC<{ bookId: string, className?: string }> = ({ bookId, className }) => {
  const { user } = useUser()
  const [reported, setReported] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  if (!user?.id) return null

  if (reported) {
    return <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}><Flag size={12} aria-hidden />Reported. Thanks for letting us know.</span>
  }

  const report = (reason: string) => {
    setIsBusy(true)
    axios.post(`/api/books/${bookId}/review-report`, { reason })
      .then(() => setReported(true))
      .catch(() => notify.error("Couldn't send your report. Try again.", { retry: () => report(reason) }))
      .finally(() => setIsBusy(false))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={isBusy} className={`inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}>
        <Flag size={12} aria-hidden />Report review
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">What&apos;s wrong with it?</DropdownMenuLabel>
        {REVIEW_REPORT_REASONS.map((reason) => (
          <DropdownMenuItem key={reason} onSelect={() => report(reason)} className="cursor-pointer">{reason}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ReportReviewButton
