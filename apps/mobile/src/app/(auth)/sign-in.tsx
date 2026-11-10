import { useRef, useState } from "react";
import { Pressable, StyleSheet, View, type TextInputInstance } from "react-native";
import { Mail } from "lucide-react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { EMAIL_NOT_VERIFIED } from "@bookmark/shared/authSchemas";
import { ProviderButtons } from "@/components/auth/ProviderButtons";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, postPublic } from "@/lib/api";
import { signInWithPassword, useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";

export default function SignIn() {
  const { colors } = useTheme();
  const completeSignIn = useAuth((s) => s.completeSignIn);
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await completeSignIn(await signInWithPassword(email.trim(), password));
    } catch (e) {
      if (e instanceof ApiError && e.body.code === EMAIL_NOT_VERIFIED) setUnverified(true);
      setError(e instanceof ApiError ? e.message : "We couldn't reach Bookmark. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    await postPublic("/api/auth/resend-verification", { email: email.trim() }).catch(() => {});
    setResent(true);
  };

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text variant="display" accessibilityRole="header">Welcome back</Text>
        <Text variant="muted">Sign in to pick up where you left off.</Text>
      </View>
      {resent ? <Notice message="If that account still needs confirming, a new link is on its way. Open it, then sign in here." /> : error ? <Notice tone="error" message={error} /> : null}
      {unverified && !resent && <Button title="Send the confirmation link again" variant="ghost" onPress={resend} />}
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Pressable accessibilityRole="link" hitSlop={10} onPress={() => WebBrowser.openBrowserAsync(webUrl("/forgot-password"))} style={styles.forgot}>
          <Text variant="muted">Forgot your password?</Text>
        </Pressable>
        <Button title="Sign in" loading={busy} onPress={submit} />
      </View>
      <ProviderButtons onError={setError}>
        <Button title="Email me a sign-in link instead" variant="outline" icon={<Mail size={18} color={colors.foreground} />} onPress={() => router.push("/email-link")} />
      </ProviderButtons>
      <View style={styles.footer}>
        <Text variant="muted">First time using Bookmark?</Text>
        <Button title="Create an account" variant="ghost" onPress={() => router.replace("/register")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  forgot: { alignSelf: "flex-end", marginTop: -4 },
  // Pinned to the foot of the screen when the form is short.
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 4, marginTop: "auto", paddingTop: 16 },
});
