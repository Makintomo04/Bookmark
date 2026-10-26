"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { Award } from 'lucide-react'
import { notify, apiError } from '@/lib/notify'
import useUser from '@/app/hooks/useUser'
import { can } from '@/lib/roles'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'

// Staff only: make a reader's public list an editors' choice, so it leads its genres' pages on Discover.
const ChoiceButton: FC<{ listId: string, initialChosen: boolean }> = ({ listId, initialChosen }) => {
  const { user } = useUser()
  const router = useRouter()
  const [chosen, setChosen] = useState(initialChosen)
  const [isBusy, setIsBusy] = useState(false)
  if (!can(user, "lists.curate")) return null

  const toggle = () => {
    setIsBusy(true)
    const request = chosen ? axios.delete(`/api/staff/lists/${listId}/choice`) : axios.post(`/api/staff/lists/${listId}/choice`)
    request
      .then((res) => {
        setChosen(!!res.data.chosen)
        router.refresh()
      })
      .catch((err) => notify.error(apiError(err, "Couldn't change that. Try again."), { retry: toggle }))
      .finally(() => setIsBusy(false))
  }

  return (
    <button type="button" onClick={toggle} disabled={isBusy} aria-pressed={chosen} className={secondaryButtonClass}
      title="Editors' choices lead this list's genres on Discover">
      <Award size={14} aria-hidden />{chosen ? "Editors' choice ✓" : "Make editors' choice"}
    </button>
  )
}

export default ChoiceButton
