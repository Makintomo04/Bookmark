import { useEffect, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { appleCredential, appleSignInAvailable } from "@/lib/appleSignIn";
import { signInWithAppleToken, signInWithGoogleToken, useAuth } from "@/lib/auth";
import { googleIdToken, googleSignInAvailable } from "@/lib/googleSignIn";
import { useTheme } from "@/lib/theme";

// "Or continue with" Apple and Google, under a rule with "or" in it. `children` (sign-in's email link) go under
// the providers, and keep the rule when neither provider is offered in this build. Apple's button is Apple's own, as its guidelines ask, and only on
// iPhone; Google's needs a build with its native module (lib/googleSignIn.native.ts). Errors go to the
// screen's notice through onError.
export function ProviderButtons({ onError, children }: { onError: (message: string | null) => void; children?: ReactNode }) {
  const { scheme, radii, colors } = useTheme();
  const completeSignIn = useAuth((s) => s.completeSignIn);
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    void appleSignInAvailable().then(setApple);
  }, []);

  if (!apple && !googleSignInAvailable && !children) return null;

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
      <View style={styles.or} accessibilityRole="text" accessibilityLabel="or">
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Text variant="small">or</Text>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
      </View>
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
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  or: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  apple: { height: 44, width: "100%" },
});
