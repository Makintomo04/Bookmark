import type { ExpoConfig } from "expo/config";

// The Bookmark app's Expo config. Values that differ per account or environment come from the
// environment (EAS secrets, or apps/mobile/.env.local for `expo start`):
//   EXPO_PUBLIC_API_URL        the web app the phone talks to (default http://localhost:3000)
//   APP_DOMAIN                 the site's host, for universal and app links (e.g. bookmark.example)
//   EAS_PROJECT_ID             set by `eas init`; push tokens need it
//   IOS_BUNDLE_ID / ANDROID_PACKAGE
//   GOOGLE_IOS_URL_SCHEME      the reversed iOS client id, for native Google sign-in
// The server side of the links and sign-in lives in apps/web (lib/appLinks.ts, lib/idTokens.ts).

const bundleId = process.env.IOS_BUNDLE_ID || "app.bookmark.mobile";
const androidPackage = process.env.ANDROID_PACKAGE || "app.bookmark.mobile";
const domain = process.env.APP_DOMAIN;
const projectId = process.env.EAS_PROJECT_ID;
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;

// The same paths apps/web/lib/appLinks.ts tells iOS and Android to hand to the app.
const LINK_PATHS = ["/open", "/circles", "/u", "/lists", "/quests", "/reset-password", "/verify-email"];

const config: ExpoConfig = {
  name: "Bookmark",
  slug: "bookmark",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "bookmark",
  // Dark-first, light fully designed; the reader picks in settings.
  userInterfaceStyle: "automatic",
  backgroundColor: "#0a0a0a",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    usesAppleSignIn: true,
    ...(domain && { associatedDomains: [`applinks:${domain}`, `webcredentials:${domain}`] }),
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      backgroundColor: "#0a0a0a",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    ...(domain && {
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: LINK_PATHS.map((pathPrefix) => ({ scheme: "https", host: domain, pathPrefix })),
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    }),
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    // Photos are only read when the reader picks one; the camera isn't used.
    ["expo-image-picker", { photosPermission: "Bookmark uses the photo you choose as your profile picture or a book cover.", cameraPermission: false, microphonePermission: false }],
    "@react-native-community/datetimepicker",
    ["expo-notifications", { color: "#F13C3C" }],
    ["expo-splash-screen", { backgroundColor: "#0a0a0a", image: "./assets/images/splash-icon.png", imageWidth: 76 }],
    ...(googleIosUrlScheme ? [["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }] as [string, object]] : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...(projectId && { eas: { projectId } }),
  },
};

export default config;
