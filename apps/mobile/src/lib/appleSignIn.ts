import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

// Sign in with Apple, on iPhone only (the App Store requires it because Google sign-in is offered).
// Apple is given the SHA-256 of a fresh nonce and puts it in the identity token; the server is sent the
// nonce itself and checks the two match (apps/web/lib/idTokens.ts), so a token can't be replayed.

export async function appleSignInAvailable() {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());
}

export interface AppleCredential {
  identityToken: string;
  nonce: string;
  // Apple only shares the name on the first sign-in.
  fullName: string | null;
}

// The credential, or null when the reader backed out.
export async function appleCredential(): Promise<AppleCredential | null> {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!credential.identityToken) return null;
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
    return { identityToken: credential.identityToken, nonce, fullName: name || null };
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw error;
  }
}
