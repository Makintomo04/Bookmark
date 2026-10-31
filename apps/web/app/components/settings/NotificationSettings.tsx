"use client"
import { FC } from 'react'
import useNotificationSettings from '@/app/hooks/useNotificationSettings'
import { PUSH_GROUP_LABELS, type PushGroup } from '@bookmark/shared/push'
import ReminderControls from './ReminderControls'
import { Toggle } from './controls'

// Reminders, the weekly email, and which notifications reach your phone. Each saves as soon as it changes
// (PATCH /api/push/settings), the same settings as the app's.
const NotificationSettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { settings, save, pending } = useNotificationSettings()
  if (!settings) return null
  const busy = disabled || pending
  const groups = (Object.keys(PUSH_GROUP_LABELS) as PushGroup[]).filter((g) => g in settings.push)

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border p-4 flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">Reminders</p>
          <p className="text-xs text-muted-foreground">All off until you turn them on, and all free.</p>
        </div>
        <ReminderControls settings={settings} save={save} disabled={busy} />
      </div>
      <div className="rounded-lg border p-4 flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">Notifications on your phone</p>
          <p className="text-xs text-muted-foreground">{settings.hasPhone ? "The bell keeps every notification, whichever you switch off here." : "These arrive on your phone once you sign in to the Bookmark app. The bell keeps them all either way."}</p>
        </div>
        {groups.map((group) => (
          <Toggle
            key={group}
            label={PUSH_GROUP_LABELS[group].title}
            hint={PUSH_GROUP_LABELS[group].description}
            checked={!!settings.push[group]}
            onChange={(on) => save({ push: { [group]: on } })}
            disabled={busy}
          />
        ))}
      </div>
    </div>
  )
}

export default NotificationSettings
