import { View } from "react-native";
import { formatMinute, parseMinute, quietHoursOf, REMINDER_COPY, reminderTimes, type NotificationChange, type NotificationSettings } from "@bookmark/shared/reminders";
import { Text } from "@/components/ui/Text";
import { TimeField } from "@/components/ui/TimeField";
import { Toggle } from "@/components/ui/Toggle";
import { Notice } from "@/components/ui/Notice";
import { usePushBlocked } from "@/lib/push";

// The reminder time a reader gets when they first turn the daily reminder on (the web's is the same).
export const DEFAULT_REMINDER_AT = "20:00";

// The four opt-in switches (daily reminder with its time, streak alert, circle checkpoints, weekly email),
// shared by Settings and the sheet after a first finished book. `showQuiet` adds the quiet-hours pickers.
export function ReminderControls({ settings, save, disabled, showQuiet = true }: { settings: NotificationSettings; save: (change: NotificationChange) => void; disabled?: boolean; showQuiet?: boolean }) {
  const { reminders, email } = settings;
  const times = reminderTimes(quietHoursOf(parseMinute(reminders.quietStart), parseMinute(reminders.quietEnd)));
  const firstTime = times.includes(parseMinute(DEFAULT_REMINDER_AT)!) ? DEFAULT_REMINDER_AT : formatMinute(times[0] ?? 0);
  const blocked = usePushBlocked();

  return (
    <View style={{ gap: 16 }}>
      {blocked && <Notice tone="info" message={REMINDER_COPY.blocked} />}
      <View style={{ gap: 8 }}>
        <Toggle label={REMINDER_COPY.daily.title} hint={REMINDER_COPY.daily.hint} value={reminders.dailyAt !== null} onChange={(on) => save({ reminders: { dailyAt: on ? firstTime : null } })} disabled={disabled} />
        {reminders.dailyAt !== null && <TimeField label="Reminder time" value={reminders.dailyAt} options={times} onChange={(v) => save({ reminders: { dailyAt: v } })} disabled={disabled} />}
      </View>
      <Toggle label={REMINDER_COPY.streak.title} hint={REMINDER_COPY.streak.hint} value={reminders.streak} onChange={(on) => save({ reminders: { streak: on } })} disabled={disabled} />
      <Toggle label={REMINDER_COPY.checkpoints.title} hint={REMINDER_COPY.checkpoints.hint} value={reminders.checkpoints} onChange={(on) => save({ reminders: { checkpoints: on } })} disabled={disabled} />
      {showQuiet && (
        <View style={{ gap: 8 }}>
          <View style={{ gap: 2 }}>
            <Text variant="label">{REMINDER_COPY.quiet.title}</Text>
            <Text variant="small">{REMINDER_COPY.quiet.hint}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TimeField label="Quiet hours start" value={reminders.quietStart} onChange={(v) => save({ reminders: { quietStart: v } })} disabled={disabled} />
            <Text variant="small">to</Text>
            <TimeField label="Quiet hours end" value={reminders.quietEnd} onChange={(v) => save({ reminders: { quietEnd: v } })} disabled={disabled} />
          </View>
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Toggle label={REMINDER_COPY.weekly.title} hint={REMINDER_COPY.weekly.hint} value={email.weekly} onChange={(on) => save({ email: { weekly: on } })} disabled={disabled} />
        {email.weekly && !email.verified && <Text variant="small">{REMINDER_COPY.unverified}</Text>}
      </View>
    </View>
  );
}
