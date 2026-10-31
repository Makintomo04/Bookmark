"use client"
import { FC } from 'react'
import { clockLabel, formatMinute, parseMinute, quietHoursOf, REMINDER_COPY, REMINDER_STEP, reminderTimes } from '@bookmark/shared/reminders'
import type { NotificationChange, NotificationSettings } from '@/app/hooks/useNotificationSettings'
import { Toggle } from './controls'

// The reminder time a reader gets when they first turn the daily reminder on: an evening, outside the
// default quiet hours.
export const DEFAULT_REMINDER_AT = "20:00"

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
const QUARTERS = Array.from({ length: (24 * 60) / REMINDER_STEP }, (_, i) => i * REMINDER_STEP)

const TimeSelect: FC<{ label: string; value: string; options: number[]; onChange: (value: string) => void; disabled: boolean }> = ({ label, value, options, onChange, disabled }) => (
  <select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
    {options.map((m) => <option key={m} value={formatMinute(m)}>{clockLabel(m)}</option>)}
  </select>
)

// The four opt-in switches (daily reminder with its time, streak alert, circle checkpoints, weekly email),
// shared by Settings and the sheet after a first finished book. `showQuiet` adds the quiet-hours pickers.
const ReminderControls: FC<{ settings: NotificationSettings; save: (change: NotificationChange) => void; disabled: boolean; showQuiet?: boolean }> = ({ settings, save, disabled, showQuiet = true }) => {
  const { reminders, email } = settings
  const quietStart = parseMinute(reminders.quietStart)
  const quietEnd = parseMinute(reminders.quietEnd)
  const quiet = quietHoursOf(quietStart, quietEnd)
  const times = reminderTimes(quiet)
  const daily = reminders.dailyAt

  return (
    <div className="flex flex-col gap-5">
      {!settings.hasPhone && <p className="text-xs text-muted-foreground">{REMINDER_COPY.phoneOnly}</p>}
      <div className="flex flex-col gap-2">
        <Toggle
          label={REMINDER_COPY.daily.title}
          hint={REMINDER_COPY.daily.hint}
          checked={daily !== null}
          onChange={(on) => save({ reminders: { dailyAt: on ? (times.includes(parseMinute(DEFAULT_REMINDER_AT)!) ? DEFAULT_REMINDER_AT : formatMinute(times[0] ?? 0)) : null } })}
          disabled={disabled}
        />
        {daily !== null && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Remind me at</span>
            <TimeSelect label="Reminder time" value={daily} options={times} onChange={(v) => save({ reminders: { dailyAt: v } })} disabled={disabled} />
          </label>
        )}
      </div>
      <Toggle label={REMINDER_COPY.streak.title} hint={REMINDER_COPY.streak.hint} checked={reminders.streak} onChange={(on) => save({ reminders: { streak: on } })} disabled={disabled} />
      <Toggle label={REMINDER_COPY.checkpoints.title} hint={REMINDER_COPY.checkpoints.hint} checked={reminders.checkpoints} onChange={(on) => save({ reminders: { checkpoints: on } })} disabled={disabled} />
      {showQuiet && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{REMINDER_COPY.quiet.title}</span>
          <span className="text-xs text-muted-foreground">{REMINDER_COPY.quiet.hint}</span>
          <div className="flex items-center gap-2 text-sm">
            <TimeSelect label="Quiet hours start" value={reminders.quietStart} options={QUARTERS} onChange={(v) => save({ reminders: { quietStart: v } })} disabled={disabled} />
            <span className="text-muted-foreground">to</span>
            <TimeSelect label="Quiet hours end" value={reminders.quietEnd} options={QUARTERS} onChange={(v) => save({ reminders: { quietEnd: v } })} disabled={disabled} />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Toggle label={REMINDER_COPY.weekly.title} hint={REMINDER_COPY.weekly.hint} checked={email.weekly} onChange={(on) => save({ email: { weekly: on } })} disabled={disabled} />
        {email.weekly && !email.verified && <p className="text-xs text-muted-foreground">{REMINDER_COPY.unverified}</p>}
      </div>
    </div>
  )
}

export default ReminderControls
