"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSWRConfig } from 'swr'
import { notify, apiError } from '@/lib/notify'
import { primaryButtonClass } from '../profile-head/ProfileHeader'

const JoinButton: FC<{ code: string }> = ({ code }) => {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [isJoining, setIsJoining] = useState(false)

  const join = () => {
    setIsJoining(true)
    axios.post("/api/buddy-reads/join", { code }).then(async ({ data }) => {
      if (data.addedToShelf) notify.info("Added to your Currently reading shelf")
      // The reading circle finds your copy in the cached shelf, which the layout keeps mounted: refresh it first.
      await mutate("/api/books/")
      router.push(`/circles/${data.buddyReadId}`)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't join. Try again."), { retry: join })
      setIsJoining(false)
    })
  }

  return (
    <button type="button" onClick={join} disabled={isJoining} className={`${primaryButtonClass} h-11 px-6 text-base`}>
      {isJoining ? "Joining…" : "Join the reading circle"}
    </button>
  )
}

export default JoinButton
