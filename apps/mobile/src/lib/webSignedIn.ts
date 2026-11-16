import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api";
import { webUrl } from "@/lib/config";

// Opens a web page already signed in as this reader, through a one-time link from the server (the web's
// lib/appHandoff.ts), so the Staff console doesn't start at the sign-in form. If the link can't be had, the
// page opens anyway and the web asks them to sign in.
export async function openWebSignedIn(path: string) {
  const handoff = await api.post<{ path: string }>("/api/mobile/auth/web-handoff", { next: path }).catch(() => null);
  await WebBrowser.openBrowserAsync(webUrl(handoff?.path ?? path));
}
