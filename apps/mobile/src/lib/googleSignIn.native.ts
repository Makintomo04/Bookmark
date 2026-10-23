import Constants, { ExecutionEnvironment } from "expo-constants";

// Native Google sign-in. Google hands the app an ID token for the web client id, which the server checks
// (apps/web/lib/idTokens.ts). Needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
// on iOS) and a development or store build: Expo Go doesn't include the native module, so it's loaded
// only when used and the button is hidden there.

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const googleSignInAvailable = !!webClientId && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let configured = false;

// The ID token, or null when the reader backed out.
export async function googleIdToken(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, isSuccessResponse } = require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin");
  if (!configured) {
    GoogleSignin.configure({ webClientId, iosClientId });
    configured = true;
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  return response.data.idToken ?? null;
}
