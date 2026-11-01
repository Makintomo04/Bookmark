import { useEffect, useState } from "react";
import { View } from "react-native";
import { clockLabel, parseMinute, SHEET_INTRO, suggestedReminders, withChange, type NotificationSettings } from "@bookmark/shared/reminders";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { useEarnMoment, useRemindersPrompt } from "@/lib/earnMoment";
import { useNotificationSettings } from "@/lib/notificationSettings";
import { currentPushToken, pushAvailable, registerForPush, usePushBlocked } from "@/lib/push";
import { DEFAULT_REMINDER_AT, ReminderControls } from "./ReminderControls";

// Offered once (the web's RemindersSheet): after a first finish this year, a third day of reading or a goal
// set, so once they've had something from Bookmark, never at sign-up. The switches start as a suggestion and nothing is saved
// until "Turn on"; "Not now", or closing it, only records that we asked. Waits for the medal celebration.
export function RemindersSheet() {
  const { asked, done } = useRemindersPrompt();
  const celebrating = useEarnMoment((s) => s.moment !== null);
  const { settings, save, pending, error } = useNotificationSettings(!!asked);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  // Pushes can't reach this phone: switched off for Bookmark, or a build or device that can't get them.
  const blocked = usePushBlocked() || !pushAvailable();

  useEffect(() => {
    if (!asked || celebrating || !settings) return;
    if (settings.prompted) return done();
    // With notifications switched off for Bookmark, suggest what can still reach them: email. After joining a
    // circle or club, checkpoints first.
    const suggestion = suggestedReminders(asked, !blocked, settings.reminders.dailyAt, DEFAULT_REMINDER_AT);
    const timer = setTimeout(() => setDraft(withChange(settings, suggestion)), 800);
    return () => clearTimeout(timer);
  }, [asked, celebrating, settings, done, blocked]);

  if (!asked || !draft) return null;

  const close = async (turnOn: boolean) => {
    // The phone's permission prompt comes now, after the sheet has said what it's for. Refused (or no token
    // to be had), the push-only reminders stay off rather than being saved as on and never arriving;
    // checkpoints still come by email.
    const wantsPush = turnOn && (draft.reminders.dailyAt !== null || draft.reminders.streak || draft.reminders.checkpoints);
    const pushOn = wantsPush && !blocked && (!!currentPushToken() || (await registerForPush()));
    const reminders = pushOn || !wantsPush
      ? { dailyAt: draft.reminders.dailyAt, streak: draft.reminders.streak, checkpoints: draft.reminders.checkpoints }
      : { dailyAt: null, streak: false, checkpoints: draft.reminders.checkpoints };
    const ok = await save(turnOn ? { reminders, email: { weekly: draft.email.weekly }, prompted: true } : { prompted: true }, { askForPush: false });
    if (!ok && turnOn) return;
    setDraft(null);
    done();
    // The same short banner a finished book gets, so "Turn on" is confirmed.
    if (turnOn) {
      const note = wantsPush && !pushOn
        ? `Notifications aren't on for Bookmark on this phone, so they'll come by email.${draft.email.verified ? " Change them any time in Settings." : " Confirm your email address and they'll start."}`
        : pushOn || draft.email.verified ? "Change them any time in Settings." : "Confirm your email address and they'll start.";
      useEarnMoment.setState({ noteTitle: "Reminders are on", note });
    }
  };

  const quietFrom = clockLabel(parseMinute(draft.reminders.quietStart) ?? 0);
  const quietTo = clockLabel(parseMinute(draft.reminders.quietEnd) ?? 0);

  return (
    <Sheet title="Want a nudge to keep reading?" onClose={() => void close(false)}>
      <View style={{ gap: 16 }}>
        <Text variant="small">{SHEET_INTRO[asked ?? "finished"]} Choose what you'd like from Bookmark. Everything here is free{!blocked && quietFrom !== quietTo ? `, and nothing arrives between ${quietFrom} and ${quietTo}` : ""}.</Text>
        {error && <Notice tone="error" message={error} />}
        <ReminderControls settings={draft} save={(change) => setDraft(withChange(draft, change))} disabled={pending} showQuiet={false} />
        <Button title="Turn on" onPress={() => void close(true)} loading={pending} />
        <Button title="Not now" variant="outline" onPress={() => void close(false)} disabled={pending} />
      </View>
    </Sheet>
  );
}
