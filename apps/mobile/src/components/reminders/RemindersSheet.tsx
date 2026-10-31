import { useEffect, useState } from "react";
import { View } from "react-native";
import { clockLabel, parseMinute, withChange, type NotificationSettings } from "@bookmark/shared/reminders";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { useEarnMoment, useRemindersPrompt } from "@/lib/earnMoment";
import { useNotificationSettings } from "@/lib/notificationSettings";
import { DEFAULT_REMINDER_AT, ReminderControls } from "./ReminderControls";

// Offered once, after the first book a reader finishes here (the web's RemindersSheet): asked once they've
// had something from Bookmark, not at sign-up. The switches start as a suggestion and nothing is saved
// until "Turn on"; "Not now", or closing it, only records that we asked. Waits for the medal celebration.
export function RemindersSheet() {
  const { asked, done } = useRemindersPrompt();
  const celebrating = useEarnMoment((s) => s.moment !== null);
  const { settings, save, pending, error } = useNotificationSettings(asked);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    if (!asked || celebrating || !settings) return;
    if (settings.prompted) return done();
    const timer = setTimeout(() => setDraft(withChange(settings, { reminders: { dailyAt: settings.reminders.dailyAt ?? DEFAULT_REMINDER_AT, streak: true, checkpoints: true } })), 800);
    return () => clearTimeout(timer);
  }, [asked, celebrating, settings, done]);

  if (!asked || !draft) return null;

  const close = async (turnOn: boolean) => {
    const ok = await save(
      turnOn
        ? { reminders: { dailyAt: draft.reminders.dailyAt, streak: draft.reminders.streak, checkpoints: draft.reminders.checkpoints }, email: { weekly: draft.email.weekly }, prompted: true }
        : { prompted: true }
    );
    if (!ok && turnOn) return;
    setDraft(null);
    done();
  };

  const quietFrom = clockLabel(parseMinute(draft.reminders.quietStart) ?? 0);
  const quietTo = clockLabel(parseMinute(draft.reminders.quietEnd) ?? 0);

  return (
    <Sheet title="Want a nudge to keep reading?" onClose={() => void close(false)}>
      <View style={{ gap: 16 }}>
        <Text variant="small">Well done on finishing. Choose what you'd like from Bookmark. Everything here is free{quietFrom !== quietTo ? `, and nothing arrives between ${quietFrom} and ${quietTo}` : ""}.</Text>
        {error && <Notice tone="error" message={error} />}
        <ReminderControls settings={draft} save={(change) => setDraft(withChange(draft, change))} disabled={pending} showQuiet={false} />
        <Button title="Turn on" onPress={() => void close(true)} loading={pending} />
        <Button title="Not now" variant="outline" onPress={() => void close(false)} disabled={pending} />
      </View>
    </Sheet>
  );
}
