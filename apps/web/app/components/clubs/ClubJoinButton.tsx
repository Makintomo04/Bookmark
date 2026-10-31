"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSWRConfig } from 'swr'
import { notify, apiError } from '@/lib/notify'
import { primaryButtonClass } from '../profile-head/ProfileHeader'
import { cn } from '@/lib/utils'

const ClubJoinButton: FC<{ code: string }> = ({ code }) => {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [isJoining, setIsJoining] = useState(false)

  const join = () => {
    setIsJoining(true)
    axios.post("/api/clubs/join", { code }).then(async ({ data }) => {
      if (data.circleIds?.length > 0) notify.info("The club's book is on your shelf")
      // Its circles find your copy in the cached shelf, which the layout keeps mounted: refresh it first.
      await mutate("/api/books/")
      router.push(`/clubs/${data.clubId}`)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't join. Try again."), { retry: join })
      setIsJoining(false)
    })
  }

  return (
    <button type="button" onClick={join} disabled={isJoining} className={cn(primaryButtonClass, "pointer-fine:h-11 px-6 text-base")}>
      {isJoining ? "Joining…" : "Join the club"}
    </button>
  )
}

export default ClubJoinButton
