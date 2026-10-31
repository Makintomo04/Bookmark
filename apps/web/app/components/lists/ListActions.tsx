"use client"
import { FC, ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Copy } from 'lucide-react'
import useUser from '@/app/hooks/useUser'
import { askToJoin } from '@/app/hooks/useJoinPrompt'
import { isListsKey } from '@/app/hooks/useLists'
import type { EditableList } from '@/app/hooks/useListEditorModal'
import { EditListButton } from '../discover/ListButtons'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'

// "Copy to my lists": a private remix, opened straight away so the reader can make it their own.
export const CopyListButton: FC<{ listId: string }> = ({ listId }) => {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { user } = useUser()
  const [isBusy, setIsBusy] = useState(false)

  // Signed out, it asks to join at this moment and brings them back to the list afterwards.
  if (!user?.id) {
    return <button type="button" onClick={() => askToJoin("list", "Join to copy this list")} className={secondaryButtonClass}><Copy size={14} aria-hidden />Copy to my lists</button>
  }

  const copy = () => {
    setIsBusy(true)
    axios.post(`/api/lists/${listId}/copy`)
      .then((res) => {
        notify.success("Copied to your lists", { description: "Only you can see it until you share it." })
        mutate(isListsKey)
        router.push(`/lists/${res.data.id}`)
      })
      .catch((err) => notify.error(apiError(err, "Couldn't copy this list. Try again."), { retry: copy }))
      .finally(() => setIsBusy(false))
  }

  return (
    <button type="button" onClick={copy} disabled={isBusy} className={secondaryButtonClass}>
      <Copy size={14} aria-hidden />{isBusy ? "Copying…" : "Copy to my lists"}
    </button>
  )
}

interface ListActionsProps {
  listId: string
  editable: EditableList | null
  canCopy: boolean
  // More actions slot in after the built-in ones.
  children?: ReactNode
}

// The buttons in a list page's header. Add new list-level actions here rather than in the page.
const ListActions: FC<ListActionsProps> = ({ listId, editable, canCopy, children }) => {
  if (!editable && !canCopy && !children) return null
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {editable && <EditListButton list={editable} />}
      {canCopy && <CopyListButton listId={listId} />}
      {children}
    </div>
  )
}

export default ListActions
