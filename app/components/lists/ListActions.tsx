"use client"
import { FC, ReactNode, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Copy } from 'lucide-react'
import useUser from '@/app/hooks/useUser'
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

  if (!user?.id) {
    return <Link href="/register" className={secondaryButtonClass}><Copy size={14} aria-hidden />Copy to my lists</Link>
  }

  const copy = () => {
    setIsBusy(true)
    axios.post(`/api/lists/${listId}/copy`)
      .then((res) => {
        toast.success("Copied to your lists. Only you can see it until you share it.", { position: "bottom-center" })
        mutate(isListsKey)
        router.push(`/lists/${res.data.id}`)
      })
      .catch((err) => toast.error(err?.response?.data?.error || "Couldn't copy this list. Try again.", { position: "bottom-center" }))
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
  // More actions (e.g. Embed) slot in after the built-in ones.
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
