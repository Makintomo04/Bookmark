import { useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { secureStorage } from "@/lib/secureStorage";

// Push notifications. The server decides what's pushed and words it (packages/shared/src/push.ts); the
// app registers this phone's Expo push token, shows pushes while open, and opens the screen a tapped
// push points at (its data.path, an app route). Needs a real phone and an EAS project id (`eas init`).

let token: string | null = null;
export const currentPushToken = () => token;

// The token this phone last registered, kept across launches, so it can be taken back once notifications are
// switched off for Bookmark (syncPushPermission) even in a session that never registered it.
const TOKEN_KEY = "bookmark.pushToken";

const supported = Platform.OS === "ios" || Platform.OS === "android";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const projectId = () => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

// Whether this build on this phone can get pushes at all: a real phone, and an EAS project id. Not on an
// emulator, nor a build made before `eas init`; reminders then offer what can come by email.
export const pushAvailable = () => supported && Device.isDevice && !!projectId();

// Asks for permission (once; after a "Don't allow" only Settings can change it), then registers the
// token with the server. Quiet when anything's missing. Only the reminders sheet and Settings call it, when
// the reader turns a reminder on, so the prompt comes after the sheet has said what it's for. Whether this
// phone now has a token registered.
export async function registerForPush(): Promise<boolean> {
  if (!pushAvailable()) return false;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Notifications", importance: Notifications.AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    token = data;
    await api.post("/api/push/tokens", { token: data, platform: Platform.OS });
    await secureStorage.set(TOKEN_KEY, data);
    return true;
  } catch (error) {
    console.warn("[push] couldn't register", error);
    return false;
  }
}

// Each time the app comes back: with notifications allowed, the token is registered (again, if they were just
// switched back on); without, this phone's token is taken back, so the server stops counting it as a way to
// reach the reader and sends what has an email form (circle checkpoints, apps/web/lib/jobs/checkpointReminders.ts)
// by email instead. Never asks: only registerForPush does, once. Also run when the signed-in app opens, so
// a phone that already allowed notifications registers without a prompt.
export async function syncPushPermission() {
  if (!pushAvailable()) return;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (granted) {
      if (!token) await registerForPush();
      return;
    }
    const stored = token ?? (await secureStorage.get(TOKEN_KEY));
    if (!stored) return;
    await api.delete("/api/push/tokens", { token: stored });
    await secureStorage.remove(TOKEN_KEY);
    token = null;
  } catch (error) {
    console.warn("[push] couldn't check permission", error);
  }
}

// Runs syncPushPermission whenever the app comes back to the front (from the phone's settings, say).
export function usePushPermissionSync() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncPushPermission();
    });
    return () => sub.remove();
  }, []);
}

// The phone's settings page for Bookmark, where notifications are switched back on.
export const openNotificationSettings = () => void Linking.openSettings().catch(() => {});

// Whether the reader has switched notifications off for Bookmark in the phone's settings, so the app can't
// ask again and pushes can't arrive. Reminders then say so, offer the phone's settings and suggest email.
// Checked again whenever the app comes back to the front, so coming back from Settings clears it.
export function usePushBlocked(): boolean {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!supported || !Device.isDevice) return;
    const check = () => {
      Notifications.getPermissionsAsync()
        .then((p) => setBlocked(!p.granted && !p.canAskAgain))
        .catch(() => setBlocked(false));
    };
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, []);
  return blocked;
}

// Opens the screen behind a tapped push, including the one that launched the app.
export function usePushNavigation() {
  const response = supported ? Notifications.useLastNotificationResponse() : null;
  useEffect(() => {
    const path = response?.notification.request.content.data?.path;
    if (typeof path === "string" && path.startsWith("/")) router.push(path as never);
  }, [response]);
}
