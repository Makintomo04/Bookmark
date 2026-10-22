"use client"
import { FC, useEffect, useState } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import axios from 'axios'
import useSWR from 'swr'
import Modal from './Modal'
import Loader from '../Loader'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { cn } from '@/lib/utils'
import { notify } from '@/lib/notify'
import { fetcher } from '@/lib/fetcher'
import useUser from '@/app/hooks/useUser'
import useRecommendModal from '@/app/hooks/useRecommendModal'
import { RECOMMEND_MAX_FRIENDS, RECOMMEND_MESSAGE_MAX, type RecommendFriend } from '@/lib/recommendRules'

// Sends one of your books to friends (people you follow who follow you back) as a notification.
const RecommendModal: FC = () => {
  const { user } = useUser()
  const { isOpen, bookId, bookTitle, onClose } = useRecommendModal()
  const { data, isLoading } = useSWR<{ friends: RecommendFriend[] }>(isOpen && bookId ? `/api/books/${bookId}/recommend` : null, fetcher)
  const [picked, setPicked] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (isOpen) { setPicked([]); setMessage("") }
  }, [isOpen, bookId])

  const friends = data?.friends ?? []
  const toggle = (username: string) => setPicked((p) => (
    p.includes(username) ? p.filter((u) => u !== username) : p.length < RECOMMEND_MAX_FRIENDS ? [...p, username] : p
  ))

  const send = () => {
    if (picked.length === 0 || isSending) return
    setIsSending(true)
    axios.post(`/api/books/${bookId}/recommend`, { usernames: picked, message: message.trim() || undefined }).then(({ data }) => {
      notify.success(data.sent > 0 ? `Sent to ${data.sent} ${data.sent === 1 ? "friend" : "friends"}` : "You've already sent them this one")
      onClose()
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't send that book")
    }).finally(() => setIsSending(false))
  }

  const body = (
    <div className="w-full px-6 flex flex-col gap-5">
      {isLoading && <Loader />}
      {!isLoading && friends.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You can send books to friends who follow you back. Once someone you follow follows you too, they&apos;ll show up here.
        </p>
      )}
      {friends.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto" aria-label="Friends">
          {friends.map((f) => {
            const on = picked.includes(f.username)
            return (
              <li key={f.username}>
                <button type="button" aria-pressed={on} onClick={() => toggle(f.username)}
                  className={cn("w-full flex items-center gap-3 rounded-md p-2 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800",
                    on && "bg-neutral-100 dark:bg-neutral-800")}>
                  <span className="h-8 w-8 rounded-full overflow-hidden relative flex-shrink-0" style={{ background: f.favColour || "#D92D2D" }}>
                    {f.image && <Image src={f.image} alt="" fill className="object-cover" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{f.username}</span>
                    {f.hasBook && <span className="block text-xs text-muted-foreground">Already has it</span>}
                  </span>
                  <span aria-hidden className={cn("h-5 w-5 rounded-md border flex-shrink-0 flex items-center justify-center", on && "bg-foreground border-foreground text-background")}>
                    {on && <Check size={14} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {friends.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="recommend-message" className="font-bold">Add a note (optional)</Label>
          <textarea id="recommend-message" value={message} maxLength={RECOMMEND_MESSAGE_MAX} rows={3}
            onChange={(e) => setMessage(e.target.value)} placeholder="Why they'd love it, minus the spoilers"
            className="w-full rounded-md border bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-2" />
        </div>
      )}
    </div>
  )

  const footer = (
    <div className="w-full p-6 flex items-center justify-end gap-3">
      <Button variant="outline" onClick={onClose} disabled={isSending}>Cancel</Button>
      {friends.length > 0 && (
        <Button style={{ background: user?.favColour ?? undefined }} onClick={send} disabled={picked.length === 0 || isSending}>
          {picked.length > 1 ? `Send to ${picked.length} friends` : "Send"}
        </Button>
      )}
    </div>
  )

  return <Modal title={bookTitle ? `Send ${bookTitle} to a friend` : "Send to a friend"} body={body} footer={footer} onClose={onClose} isOpen={isOpen} disabled={isSending} size="sm" />
}

export default RecommendModal
