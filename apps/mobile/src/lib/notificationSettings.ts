import { useState } from "react";
import useSWR from "swr";
import { REMINDER_COPY, withChange, type NotificationChange, type NotificationSettings } from "@bookmark/shared/reminders";
import { ApiError, api } from "@/lib/api";
import { currentPushToken, registerForPush } from "@/lib/push";

// Push, reminder and email settings (GET and PATCH /api/push/settings), for Settings and the reminders
// sheet. Optimistic: a switch moves straight away and rolls back, with the server's reason, if refused.
// Turning a reminder on asks for notification permission if this phone hasn't been registered yet, and waits
// for the answer: refused, a daily reminder or streak alert isn't saved (they only come as pushes), while
// checkpoints still are (they come by email instead).
// `enabled` false waits: the reminders sheet only loads them once it has something to ask. The sheet asks for
// permission itself first (`askForPush: false`), so it knows what came of it.
export function useNotificationSettings(enabled = true) {
  const { data, mutate } = useSWR<NotificationSettings>(enabled ? "/api/push/settings" : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (change: NotificationChange, { askForPush = true }: { askForPush?: boolean } = {}): Promise<boolean> => {
    if (!data) return false;
    setError(null);
    setPending(true);
    const r = change.reminders;
    if (askForPush && r && (r.dailyAt || r.streak || r.checkpoints) && !currentPushToken()) {
      const registered = await registerForPush();
      if (!registered && (r.dailyAt || r.streak)) {
        setError(REMINDER_COPY.noPush);
        setPending(false);
        return false;
      }
    }
    void mutate(withChange(data, change), { revalidate: false });
    try {
      await mutate(api.patch<NotificationSettings>("/api/push/settings", change), { revalidate: false });
      return true;
    } catch (e) {
      void mutate(data, { revalidate: false });
      setError(e instanceof ApiError && e.body?.error ? e.body.error : "Couldn't save that setting. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  };

  return { settings: data ?? null, save, pending, error };
}
