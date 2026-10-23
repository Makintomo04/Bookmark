import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "@/lib/api";

// Push notifications. The server decides what's pushed and words it (packages/shared/src/push.ts); the
// app registers this phone's Expo push token, shows pushes while open, and opens the screen a tapped
// push points at (its data.path, an app route). Needs a real phone and an EAS project id (`eas init`).

let token: string | null = null;
export const currentPushToken = () => token;

const supported = Platform.OS === "ios" || Platform.OS === "android";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const projectId = () => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

// Asks for permission (once; after a "Don't allow" only Settings can change it), then registers the
// token with the server. Quiet when anything's missing.
export async function registerForPush() {
  if (!supported || !Device.isDevice || !projectId()) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Notifications", importance: Notifications.AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    token = data;
    await api.post("/api/push/tokens", { token: data, platform: Platform.OS });
  } catch (error) {
    console.warn("[push] couldn't register", error);
  }
}

// Opens the screen behind a tapped push, including the one that launched the app.
export function usePushNavigation() {
  const response = supported ? Notifications.useLastNotificationResponse() : null;
  useEffect(() => {
    const path = response?.notification.request.content.data?.path;
    if (typeof path === "string" && path.startsWith("/")) router.push(path as never);
  }, [response]);
}
