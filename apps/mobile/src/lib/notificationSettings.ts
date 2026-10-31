import { useState } from "react";
import useSWR from "swr";
import { withChange, type NotificationChange, type NotificationSettings } from "@bookmark/shared/reminders";
import { ApiError, api } from "@/lib/api";
import { currentPushToken, registerForPush } from "@/lib/push";

// Push, reminder and email settings (GET and PATCH /api/push/settings), for Settings and the reminders
// sheet. Optimistic: a switch moves straight away and rolls back, with the server's reason, if refused.
// Turning a reminder on asks for notification permission if this phone hasn't been registered yet.
// `enabled` false waits: the reminders sheet only loads them once it has something to ask.
export function useNotificationSettings(enabled = true) {
  const { data, mutate } = useSWR<NotificationSettings>(enabled ? "/api/push/settings" : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (change: NotificationChange): Promise<boolean> => {
    if (!data) return false;
    setError(null);
    setPending(true);
    const r = change.reminders;
    if (r && (r.dailyAt || r.streak || r.checkpoints) && !currentPushToken()) void registerForPush();
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
