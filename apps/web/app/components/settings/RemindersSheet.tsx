"use client"
import { FC, useEffect, useState } from 'react'
import { clockLabel, parseMinute, SHEET_INTRO, withChange, type NotificationSettings } from '@bookmark/shared/reminders'
import { useEarnMoment, useRemindersPrompt } from '@/app/hooks/useEarnMoment'
import useNotificationSettings from '@/app/hooks/useNotificationSettings'
import { notify } from '@/lib/notify'
import Modal from '../modals/Modal'
import { Button } from '../ui/button'
import ReminderControls, { DEFAULT_REMINDER_AT } from './ReminderControls'

// Offered once, when the server says (askReminders): a first finish this year, a third day of reading, or a
// goal set, whichever comes first. We ask once they've had something from Bookmark, not at sign-up. The
// switches start as a suggestion and nothing is saved until "Turn on"; "Not now", or closing it, only
// records that we asked. Opens after the medal celebration, never on top of it. Mounted in the root layout.
const RemindersSheet: FC = () => {
  const { asked, done } = useRemindersPrompt()
  const celebrating = useEarnMoment((s) => s.moment !== null)
  const { settings, save, pending } = useNotificationSettings(!!asked)
  const [draft, setDraft] = useState<NotificationSettings | null>(null)
  const [open, setOpen] = useState(false)

  // A moment after the save's toast, so the two don't land at once.
  useEffect(() => {
    if (!asked || celebrating || !settings) return
    if (settings.prompted) return done()
    const timer = setTimeout(() => {
      // Suggest what can reach them: the phone reminders when they have the app, otherwise the weekly email
      // and checkpoint emails.
      setDraft(settings.hasPhone
        ? withChange(settings, { reminders: { dailyAt: settings.reminders.dailyAt ?? DEFAULT_REMINDER_AT, streak: true, checkpoints: true } })
        : withChange(settings, { reminders: { checkpoints: true }, email: { weekly: true } }))
      setOpen(true)
    }, 800)
    return () => clearTimeout(timer)
  }, [asked, celebrating, settings, done])

  if (!open || !draft) return null

  const close = async (turnOn: boolean) => {
    const ok = await save(turnOn
      ? { reminders: { dailyAt: draft.reminders.dailyAt, streak: draft.reminders.streak, checkpoints: draft.reminders.checkpoints }, email: { weekly: draft.email.weekly }, prompted: true }
      : { prompted: true })
    if (!ok && turnOn) return
    setOpen(false)
    done()
    const pushOn = draft.hasPhone && (draft.reminders.dailyAt !== null || draft.reminders.streak || draft.reminders.checkpoints)
    const emailOn = draft.email.weekly || (!draft.hasPhone && draft.reminders.checkpoints)
    const title = pushOn ? "Reminders are on" : emailOn ? (draft.email.verified ? "Your emails are on" : "Confirm your email to start them") : null
    if (turnOn && title) notify.success(title, { description: "Change them any time in Settings." })
  }

  const quietFrom = clockLabel(parseMinute(draft.reminders.quietStart) ?? 0)
  const quietTo = clockLabel(parseMinute(draft.reminders.quietEnd) ?? 0)

  return (
    <Modal
      isOpen
      size="sm"
      title="Want a nudge to keep reading?"
      onClose={() => void close(false)}
      closeOnBackdrop={false}
      body={
        <div className="w-full px-6 flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">{SHEET_INTRO[asked ?? "finished"]} Choose what you&apos;d like from Bookmark. Everything here is free{draft.hasPhone && quietFrom !== quietTo && <>, and nothing arrives on your phone between {quietFrom} and {quietTo}</>}.</p>
          <ReminderControls settings={draft} save={(change) => setDraft(withChange(draft, change))} disabled={pending} showQuiet={false} />
        </div>
      }
      footer={
        <div className="w-full p-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => void close(false)} disabled={pending}>Not now</Button>
          <Button onClick={() => void close(true)} loading={pending}>Turn on</Button>
        </div>
      }
      disabled={pending}
      compact
    />
  )
}

export default RemindersSheet
