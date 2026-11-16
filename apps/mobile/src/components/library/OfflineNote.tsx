import { Notice } from "@/components/ui/Notice";
import { useConnection } from "@/lib/connection";
import { useOffline, useSavedAt } from "@/lib/offline";

// The quiet line over a screen showing the copy kept on the phone (BOO-105): that it's offline, when the copy
// is from, and the progress waiting to be sent. Nothing while online with nothing waiting.
//   - `savedKey`: the answer the screen shows, for "as of 14:32" (none when it has no copy yet).
//   - `book`: on a book page, says progress can still be logged.

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DAY_MS = 86_400_000;

function asOf(savedAt: number, now = new Date()) {
  const saved = new Date(savedAt);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (savedAt >= midnight) return time.format(saved);
  if (savedAt >= midnight - DAY_MS) return `yesterday, ${time.format(saved)}`;
  return day.format(saved);
}

const updates = (n: number) => (n === 1 ? "1 progress update" : `${n} progress updates`);

export function OfflineNote({ savedKey, book = false }: { savedKey?: string; book?: boolean }) {
  const online = useConnection((s) => s.online);
  const waiting = useOffline((s) => s.queue.length);
  const sending = useOffline((s) => s.sending);
  const savedAt = useSavedAt(savedKey ?? "");

  if (online) {
    if (waiting === 0) return null;
    return <Notice message={sending ? `Sending ${updates(waiting)}…` : `${updates(waiting)} waiting to send.`} />;
  }
  const parts = [
    savedAt ? `You're offline. Showing ${book ? "this book" : "your shelves"} as of ${asOf(savedAt)}.` : "You're offline.",
    book ? "Progress you log is kept on your phone and sent when you're back." : waiting > 0 ? `${updates(waiting)} will send when you're back.` : "",
  ];
  return <Notice message={parts.filter(Boolean).join(" ")} />;
}
