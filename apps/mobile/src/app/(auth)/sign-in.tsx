import { useRef, useState } from "react";
import { StyleSheet, View, type TextInputInstance } from "react-native";
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

export default function SignIn() {
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
      <Text variant="display">Welcome back</Text>
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
        <Button title="Sign in" loading={busy} onPress={submit} />
        <View style={styles.links}>
          <Button title="Email me a sign-in link" variant="ghost" onPress={() => router.push("/email-link")} />
          <Button title="Forgot your password?" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(webUrl("/forgot-password"))} />
        </View>
      </View>
      <ProviderButtons onError={setError} />
      <View style={styles.footer}>
        <Text variant="muted">First time using Bookmark?</Text>
        <Button title="Create an account" variant="ghost" onPress={() => router.replace("/register")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 8 },
});
