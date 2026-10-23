import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { appleCredential, appleSignInAvailable } from "@/lib/appleSignIn";
import { signInWithAppleToken, signInWithGoogleToken, useAuth } from "@/lib/auth";
import { googleIdToken, googleSignInAvailable } from "@/lib/googleSignIn";
import { useTheme } from "@/lib/theme";

// "Or continue with" Apple and Google. Apple's button is Apple's own, as its guidelines ask, and only on
// iPhone; Google's needs a build with its native module (lib/googleSignIn.native.ts). Errors go to the
// screen's notice through onError.
export function ProviderButtons({ onError }: { onError: (message: string | null) => void }) {
  const { scheme, radii } = useTheme();
  const completeSignIn = useAuth((s) => s.completeSignIn);
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    void appleSignInAvailable().then(setApple);
  }, []);

  if (!apple && !googleSignInAvailable) return null;

  const run = async (which: "apple" | "google", go: () => Promise<boolean>) => {
    onError(null);
    setBusy(which);
    try {
      await go();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : `${which === "apple" ? "Sign in with Apple" : "Google sign-in"} didn't work. Try again.`);
    } finally {
      setBusy(null);
    }
  };

  const withApple = () =>
    run("apple", async () => {
      const credential = await appleCredential();
      if (!credential) return false;
      await completeSignIn(await signInWithAppleToken(credential.identityToken, credential.nonce, credential.fullName));
      return true;
    });

  const withGoogle = () =>
    run("google", async () => {
      const idToken = await googleIdToken();
      if (!idToken) return false;
      await completeSignIn(await signInWithGoogleToken(idToken));
      return true;
    });

  return (
    <View style={styles.wrap}>
      <Text variant="small" style={styles.or}>OR</Text>
      {apple && Platform.OS === "ios" && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={scheme === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.md}
          style={styles.apple}
          onPress={() => { if (!busy) void withApple(); }}
        />
      )}
      {googleSignInAvailable && <Button title="Continue with Google" variant="outline" loading={busy === "google"} onPress={withGoogle} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  or: { textAlign: "center", fontWeight: "600", letterSpacing: 1 },
  apple: { height: 48, width: "100%" },
});
