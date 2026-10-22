"use client"
import { FC, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Pencil, Plus } from 'lucide-react'
import Modal from '../modals/Modal'
import { Button } from '../ui/button'
import QuestMedal, { QUEST_ICON_COMPONENTS } from '../achievements/QuestMedal'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/genres'
import useUser from '@/app/hooks/useUser'
import {
  EditableQuest, GOAL_TYPES, QUEST_COUNT_MAX, QUEST_DESCRIPTION_MAX, QUEST_ICONS, QUEST_TITLE_MAX, QuestGoalType, describeGoal, emptyQuest, parseGoal, slugify,
} from '@/lib/questRules'

const fieldClass = "w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
const labelClass = "flex flex-col gap-1.5 text-sm font-medium"
const hintClass = "font-normal text-muted-foreground"

type Pick = { id: string, title: string }

// The staff form for a quest, in a modal like the list editor. Medals are drawn live as you edit.
const QuestEditorModal: FC<{ initial: EditableQuest, onClose: () => void }> = ({ initial, onClose }) => {
  const router = useRouter()
  const [draft, setDraft] = useState<EditableQuest>(initial)
  const [slugTouched, setSlugTouched] = useState(!!initial.id)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picks, setPicks] = useState<Pick[]>([])
  const isNew = !initial.id
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial)

  // Bookmark Picks to link a list quest to.
  useEffect(() => {
    axios.get('/api/lists?pick=1&limit=50').then((res) => setPicks(res.data)).catch(() => setPicks([]))
  }, [])

  const update = (patch: Partial<EditableQuest>) => setDraft((d) => ({ ...d, ...patch }))
  const updateGoal = (patch: Partial<EditableQuest["goal"]>) => setDraft((d) => ({ ...d, goal: { ...d.goal, ...patch } }))
  const setType = (type: QuestGoalType) => updateGoal({
    type,
    listId: type === "list" ? draft.goal.listId ?? picks[0]?.id : undefined,
    genre: type === "genre" ? draft.goal.genre ?? GENRES[0].slug : undefined,
    minPages: type === "pages" ? draft.goal.minPages ?? 600 : undefined,
  })

  const goal = parseGoal(draft.goal)
  const goalPreview = goal ? describeGoal(goal, goal.type === "list" ? picks.find((p) => p.id === goal.listId)?.title : null) : "Finish the goal settings"

  const save = () => {
    setIsSaving(true)
    const request = isNew ? axios.post('/api/quests', draft) : axios.patch(`/api/quests/${initial.id}`, draft)
    request
      .then((res) => {
        onClose()
        router.push(`/quests/${res.data.slug}`)
        router.refresh()
      })
      .catch((e) => notify.error(apiError(e, "Couldn't save the quest. Try again."), { retry: save }))
      .finally(() => setIsSaving(false))
  }

  const remove = () => {
    setIsSaving(true)
    axios.delete(`/api/quests/${initial.id}`)
      .then(() => {
        notify.success("Quest deleted")
        onClose()
        router.push('/quests')
        router.refresh()
      })
      .catch((e) => notify.error(apiError(e, "Couldn't delete the quest.")))
      .finally(() => { setIsSaving(false); setConfirmDelete(false) })
  }

  const body = (
    <div className="w-full px-6 self-start flex flex-col gap-6 pb-2">
      <div className="flex items-center gap-5 rounded-xl bg-neutral-50 dark:bg-neutral-900 p-4">
        <QuestMedal design={{ colour: draft.medalColour, ribbon: draft.ribbonColour, icon: draft.medalIcon }} earned className="w-20 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{draft.title || "Untitled quest"}</p>
          <p className="text-sm text-muted-foreground">{goalPreview}</p>
        </div>
      </div>

      <label className={labelClass}>Title
        <input value={draft.title} maxLength={QUEST_TITLE_MAX} disabled={isSaving}
          onChange={(e) => update({ title: e.target.value, ...(!slugTouched && { slug: slugify(e.target.value) }) })}
          placeholder="Autumn of Staff Picks" className={cn(fieldClass, "h-10")} />
      </label>
      <label className={labelClass}><span>Address <span className={hintClass}>· bookmark.app/quests/…</span></span>
        <input value={draft.slug} maxLength={60} disabled={isSaving}
          onChange={(e) => { setSlugTouched(true); update({ slug: e.target.value }) }}
          onBlur={() => update({ slug: slugify(draft.slug) })}
          placeholder="autumn-of-staff-picks" className={cn(fieldClass, "h-10")} />
      </label>
      <label className={labelClass}>Description
        <textarea value={draft.description} maxLength={QUEST_DESCRIPTION_MAX} rows={3} disabled={isSaving}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="What the quest is about, and why it's worth doing" className={cn(fieldClass, "py-2 resize-y")} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}><span>Starts <span className={hintClass}>· UTC</span></span>
          <input type="date" value={draft.startsAt} disabled={isSaving} onChange={(e) => update({ startsAt: e.target.value })} className={cn(fieldClass, "h-10")} />
        </label>
        <label className={labelClass}><span>Ends <span className={hintClass}>· last day</span></span>
          <input type="date" value={draft.endsAt} min={draft.startsAt || undefined} disabled={isSaving} onChange={(e) => update({ endsAt: e.target.value })} className={cn(fieldClass, "h-10")} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <legend className="px-1 text-sm font-medium">Goal</legend>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <label className={labelClass}>Type
            <select value={draft.goal.type} disabled={isSaving} onChange={(e) => setType(e.target.value as QuestGoalType)} className={cn(fieldClass, "h-10")}>
              {GOAL_TYPES.map((g) => <option key={g.type} value={g.type}>{g.label}</option>)}
            </select>
          </label>
          <label className={labelClass}>Books
            <input type="number" min={1} max={QUEST_COUNT_MAX} value={draft.goal.count} disabled={isSaving}
              onChange={(e) => updateGoal({ count: Number(e.target.value) })} className={cn(fieldClass, "h-10 tabular-nums")} />
          </label>
        </div>
        {draft.goal.type === "list" && (
          <label className={labelClass}>Bookmark Pick
            <select value={draft.goal.listId ?? ""} disabled={isSaving} onChange={(e) => updateGoal({ listId: e.target.value })} className={cn(fieldClass, "h-10")}>
              <option value="" disabled>{picks.length ? "Choose a list" : "No Picks yet"}</option>
              {picks.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        )}
        {draft.goal.type === "genre" && (
          <label className={labelClass}>Genre
            <select value={draft.goal.genre ?? ""} disabled={isSaving} onChange={(e) => updateGoal({ genre: e.target.value })} className={cn(fieldClass, "h-10")}>
              {GENRES.map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
            </select>
          </label>
        )}
        {draft.goal.type === "pages" && (
          <label className={labelClass}><span>At least this many pages <span className={hintClass}>· Open Library&apos;s count when we have it</span></span>
            <input type="number" min={1} max={3000} value={draft.goal.minPages ?? ""} disabled={isSaving}
              onChange={(e) => updateGoal({ minPages: Number(e.target.value) })} className={cn(fieldClass, "h-10 tabular-nums")} />
          </label>
        )}
        <p className="text-xs text-muted-foreground">Only books finished inside the quest&apos;s dates count.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Medal</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={draft.medalColour} disabled={isSaving} onChange={(e) => update({ medalColour: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
            Face
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={draft.ribbonColour} disabled={isSaving} onChange={(e) => update({ ribbonColour: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700 bg-transparent" />
            Ribbon
          </label>
        </div>
        <div role="radiogroup" aria-label="Medal icon" className="flex flex-wrap gap-1.5">
          {QUEST_ICONS.map((icon) => {
            const Icon = QUEST_ICON_COMPONENTS[icon]
            const on = draft.medalIcon === icon
            return (
              <button key={icon} type="button" role="radio" aria-checked={on} aria-label={icon} disabled={isSaving} onClick={() => update({ medalIcon: icon })}
                className={cn("grid size-10 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-transparent" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900")}
                style={on ? { background: draft.medalColour, color: "#FBF1DF" } : undefined}>
                <Icon size={18} aria-hidden />
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={draft.hidden} disabled={isSaving} onChange={(e) => update({ hidden: e.target.checked })} className="mt-1 size-4" />
        <span><span className="block font-medium">Draft</span><span className="block text-xs text-muted-foreground">Only the Bookmark team sees it, and nobody can earn it. Untick to publish.</span></span>
      </label>
    </div>
  )

  const footer = (
    <div className="w-full p-6 flex flex-wrap items-center justify-end gap-3">
      {!isNew && (confirmDelete ? (
        <div className="mr-auto flex items-center gap-2">
          <Button type="button" onClick={remove} disabled={isSaving} className="bg-rose-700 hover:bg-rose-800 text-white">Delete quest</Button>
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={isSaving}>Keep it</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)} disabled={isSaving} className="mr-auto text-rose-600 dark:text-rose-400 hover:text-rose-600">Delete</Button>
      ))}
      <Button type="button" variant="outline" onClick={onClose} disabled={isSaving} className="hidden sm:inline-flex">{isDirty ? "Cancel" : "Close"}</Button>
      <Button type="button" onClick={save} disabled={isSaving || !isDirty || !draft.title.trim() || !goal}>
        {isSaving ? "Saving…" : isNew ? "Create quest" : "Save changes"}
      </Button>
    </div>
  )

  return (
    <Modal title={isNew ? "New quest" : "Edit quest"} body={body} footer={footer} onClose={onClose} isOpen disabled={isSaving} closeOnBackdrop={!isDirty} compact />
  )
}

// Staff tools on /quests and /quests/[slug]. Render nothing for everyone else; the API checks too.
export const NewQuestButton: FC = () => {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  if (!user?.isStaff) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}><Plus size={16} aria-hidden />New quest</button>
      {open && <QuestEditorModal initial={emptyQuest()} onClose={() => setOpen(false)} />}
    </>
  )
}

export const EditQuestButton: FC<{ quest: EditableQuest }> = ({ quest }) => {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  if (!user?.isStaff) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}><Pencil size={14} aria-hidden />Edit quest</button>
      {open && <QuestEditorModal initial={quest} onClose={() => setOpen(false)} />}
    </>
  )
}
