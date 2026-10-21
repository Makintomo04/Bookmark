"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { toast } from 'react-toastify'
import { primaryButtonClass } from '../profile-head/ProfileHeader'

const JoinButton: FC<{ code: string }> = ({ code }) => {
  const router = useRouter()
  const [isJoining, setIsJoining] = useState(false)

  const join = () => {
    setIsJoining(true)
    axios.post("/api/buddy-reads/join", { code }).then(({ data }) => {
      if (data.addedToShelf) toast.success("Added to your Currently reading shelf", { position: "bottom-center" })
      router.push(`/buddy-reads/${data.buddyReadId}`)
    }).catch((err) => {
      toast.error(err?.response?.data?.error || "Couldn't join. Try again.", { position: "bottom-center" })
      setIsJoining(false)
    })
  }

  return (
    <button type="button" onClick={join} disabled={isJoining} className={`${primaryButtonClass} h-11 px-6 text-base`}>
      {isJoining ? "Joining…" : "Join the buddy read"}
    </button>
  )
}

export default JoinButton
