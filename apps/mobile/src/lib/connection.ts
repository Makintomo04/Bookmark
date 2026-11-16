import { create } from "zustand";

// Whether the Bookmark API can be reached, as the last request found (BOO-105). Learned from requests rather
// than the phone's network state: a request that can't get through says offline, any answer says online.
// That needs no native module, and it's what matters anyway: Wi-Fi with no internet is still offline here.
// lib/books.ts (useOfflineSync) checks again every so often while offline.

export class OfflineError extends Error {
  constructor() {
    super("You're offline.");
    this.name = "OfflineError";
  }
}

export const useConnection = create<{ online: boolean }>(() => ({ online: true }));

export function noteOnline() {
  if (!useConnection.getState().online) useConnection.setState({ online: true });
}

export function noteOffline() {
  if (useConnection.getState().online) useConnection.setState({ online: false });
}
