import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { create } from "zustand";
import { mutate, type Middleware } from "swr";
import { File, Paths } from "expo-file-system";
import { isSavedKey, pruneSaved, queueProgress, withQueuedPlace, type QueuedProgress, type SavedEntry } from "@bookmark/shared/offlineShelf";

// Offline shelves (BOO-105): a saved copy of the reader's shelves, kept on the phone, and the progress updates
// waiting to be sent. The rules (what's kept, how updates combine) are in @bookmark/shared/offlineShelf; this is
// where they live on the phone: one file per account in the app's documents, deleted on sign-out.
//
// The copy is handed to SWR as `fallback` (app/_layout.tsx), so a screen opens with it straight away and SWR
// fetches as usual; offline the fetch fails and the screen keeps showing the copy. `rememberAnswers` saves each
// fresh answer for a kept key. Sending the queue is lib/books.ts's (useOfflineSync), next to the saves.

interface OfflineState {
  userId: string | null;
  // The live copy, saved to the file.
  saved: Record<string, SavedEntry>;
  // The copy as it was loaded, with waiting updates shown on it: SWR's fallback. Not updated as answers come
  // in, so screens don't redraw on every save; by then SWR has the fresh answer anyway.
  fallback: Record<string, unknown>;
  queue: QueuedProgress[];
  sending: boolean;
}

export const useOffline = create<OfflineState>(() => ({ userId: null, saved: {}, fallback: {}, queue: [], sending: false }));

const supported = Platform.OS !== "web";
const fileFor = (userId: string) => new File(Paths.document, `offline-shelves-${userId}.json`);
interface SavedFile { version: 1; saved: Record<string, SavedEntry>; queue: QueuedProgress[] }

// A waiting update shown on any answer that holds the book: its own page, the Library's shelves, a shelf page.
export function withQueued(data: unknown, item: QueuedProgress): unknown {
  if (!data || typeof data !== "object") return data;
  const value = data as { id?: unknown; shelves?: Record<string, unknown[]>; books?: unknown[] };
  if (value.id === item.bookId) return withQueuedPlace(value as Record<string, unknown>, item.place);
  const onBook = (books: unknown[]) => books.map((b) => ((b as { id?: unknown })?.id === item.bookId ? withQueuedPlace(b as Record<string, unknown>, item.place) : b));
  if (value.shelves && typeof value.shelves === "object") {
    return { ...value, shelves: Object.fromEntries(Object.entries(value.shelves).map(([shelf, books]) => [shelf, Array.isArray(books) ? onBook(books) : books])) };
  }
  if (Array.isArray(value.books)) return { ...value, books: onBook(value.books) };
  return data;
}

const fallbackOf = (saved: Record<string, SavedEntry>, queue: QueuedProgress[]) =>
  Object.fromEntries(Object.entries(saved).map(([key, entry]) => [key, queue.reduce((data, item) => withQueued(data, item), entry.data)]));

// Reads the account's copy before the app shows it (lib/auth.ts: restore and sign-in). Nothing on web.
export async function loadOffline(userId: string) {
  let saved: Record<string, SavedEntry> = {};
  let queue: QueuedProgress[] = [];
  if (supported) {
    try {
      const file = fileFor(userId);
      if (file.exists) {
        const body = JSON.parse(await file.text()) as Partial<SavedFile>;
        if (body?.version === 1) {
          saved = pruneSaved(body.saved ?? {});
          queue = Array.isArray(body.queue) ? body.queue : [];
        }
      }
    } catch {
      // A damaged copy is no copy: the shelves load from the server as before.
    }
  }
  useOffline.setState({ userId, saved, queue, fallback: fallbackOf(saved, queue), sending: false });
}

// Signing out deletes the copy and anything still waiting, so the next reader on the phone sees none of it.
export function clearOffline() {
  const { userId } = useOffline.getState();
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  useOffline.setState({ userId: null, saved: {}, fallback: {}, queue: [], sending: false });
  if (!supported || !userId) return;
  try {
    const file = fileFor(userId);
    if (file.exists) file.delete();
  } catch {
    // Nothing to tell anyone.
  }
}

// ---- Saving to the file ------------------------------------------------------------------------------

let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function writeNow() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  const { userId, saved, queue } = useOffline.getState();
  if (!supported || !userId) return;
  try {
    const file = fileFor(userId);
    if (!file.exists) file.create();
    const body: SavedFile = { version: 1, saved, queue };
    await file.write(JSON.stringify(body));
  } catch {
    // A full phone: the copy just isn't updated.
  }
}

// Answers arrive in bursts (opening the Library fetches several), so they're written together.
const writeSoon = () => {
  if (!writeTimer) writeTimer = setTimeout(() => void writeNow(), 2000);
};

// Going to the background may be the last chance to write before the phone stops the app.
if (supported) AppState.addEventListener("change", (state) => { if (state !== "active" && writeTimer) void writeNow(); });

export function remember(key: string, data: unknown) {
  const state = useOffline.getState();
  if (!supported || !state.userId || !isSavedKey(key)) return;
  useOffline.setState({ saved: pruneSaved({ ...state.saved, [key]: { data, savedAt: Date.now() } }) });
  writeSoon();
}

// SWR middleware: saves each fresh answer for a kept key, after the render that shows it. The fallback itself
// isn't an answer, so it's skipped.
export const rememberAnswers: Middleware = (useSWRNext) => (key, fetcher, config) => {
  const swr = useSWRNext(key, fetcher, config);
  const data = swr.data;
  useEffect(() => {
    if (typeof key !== "string" || data === undefined) return;
    const { fallback, saved } = useOffline.getState();
    if (data !== fallback[key] && saved[key]?.data !== data) remember(key, data);
  }, [key, data]);
  return swr;
};

// When the kept copy of `key` was saved, for "as of 14:32".
export const useSavedAt = (key: string) => useOffline((s) => s.saved[key]?.savedAt ?? null);

// ---- The queue -----------------------------------------------------------------------------------------

// Keeps a progress update to send later, and shows it straight away wherever the book is on screen: in SWR's
// cache for screens that loaded this session, and in the fallback for screens showing the kept copy (offline,
// SWR has nothing cached for those, so mutate alone wouldn't reach them).
export async function queueBookProgress(bookId: string, place: Record<string, unknown>) {
  const item: QueuedProgress = { bookId, place, loggedAt: new Date().toISOString() };
  useOffline.setState((s) => ({
    queue: queueProgress(s.queue, item),
    fallback: Object.fromEntries(Object.entries(s.fallback).map(([key, data]) => [key, withQueued(data, item)])),
  }));
  await writeNow();
  await mutate((key) => typeof key === "string" && (key === `/api/books/${bookId}` || key.startsWith("/api/books?")), (data: unknown) => withQueued(data, item), { revalidate: false });
}

// Takes one update off the queue once it's sent (or can't be): only that one, if a newer place was logged meanwhile.
export function dropQueued(item: Pick<QueuedProgress, "bookId" | "loggedAt">) {
  useOffline.setState((s) => ({ queue: s.queue.filter((q) => !(q.bookId === item.bookId && q.loggedAt === item.loggedAt)) }));
  writeSoon();
}

// A save made online replaces anything still waiting for that book.
export function dropQueuedFor(bookId: string) {
  if (!useOffline.getState().queue.some((q) => q.bookId === bookId)) return;
  useOffline.setState((s) => ({ queue: s.queue.filter((q) => q.bookId !== bookId) }));
  writeSoon();
}

export const setSending = (sending: boolean) => useOffline.setState({ sending });
