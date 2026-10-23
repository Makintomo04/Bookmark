import { Platform } from "react-native";

// The Bookmark web app the phone talks to. Set EXPO_PUBLIC_API_URL for anything but local development
// (EAS environment variables, or apps/mobile/.env.local). Locally, the Android emulator reaches this
// computer's localhost as 10.0.2.2.
const fallback = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || fallback).replace(/\/$/, "");

// Pages that stay on the web (help, legal, password reset) open in an in-app browser.
export const webUrl = (path: string) => `${API_URL}${path}`;

// RevenueCat's public SDK keys, one per store (EAS environment variables). Without one, the Plus screen
// says purchases aren't set up in this build instead of offering a paywall.
export const REVENUECAT_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
}) || null;
