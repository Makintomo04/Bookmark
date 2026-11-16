import { useRef, useState } from "react";
import { StyleSheet, View, type TextInputInstance } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { PASSWORD_MIN, registerSchema } from "@bookmark/shared/authSchemas";
import { CheckInbox } from "@/components/auth/CheckInbox";
import { ProviderButtons } from "@/components/auth/ProviderButtons";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { register } from "@/lib/auth";
import { webUrl } from "@/lib/config";

// Creating an account with an email and password. The web's /api/register emails a confirmation link;
// once it's opened, the reader signs in here. Google and Apple skip the email.
export default function Register() {
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    const parsed = registerSchema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your email and password.");
    setBusy(true);
    setError(null);
    try {
      await register(parsed.data.email, parsed.data.password);
      setSentTo(parsed.data.email.toLowerCase());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't reach Bookmark. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <CheckInbox message={`We sent a link to ${sentTo}. Open it to confirm your email, then sign in here.`} note={"It expires in 24 hours. Can’t find it? Check your spam folder."}>
        <View style={{ alignSelf: "stretch" }}><Button title="Sign in" variant="outline" onPress={() => router.replace("/sign-in")} /></View>
        <Button title="Use a different email" variant="ghost" onPress={() => setSentTo(null)} />
      </CheckInbox>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text variant="display" accessibilityRole="header">Create your account</Text>
        <Text variant="muted">Free, with stats, goals and reading circles.</Text>
      </View>
      {error && <Notice tone="error" message={error} />}
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
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          hint={`At least ${PASSWORD_MIN} characters`}
        />
        <Button title="Create account" loading={busy} onPress={submit} />
      </View>
      <ProviderButtons onError={setError} />
      <Text variant="small" style={{ textAlign: "center" }}>
        By signing up, you agree to our{" "}
        <Text variant="small" style={styles.link} onPress={() => WebBrowser.openBrowserAsync(webUrl("/terms"))}>Terms</Text> and{" "}
        <Text variant="small" style={styles.link} onPress={() => WebBrowser.openBrowserAsync(webUrl("/privacy"))}>Privacy Policy</Text>.
      </Text>
      <View style={styles.footer}>
        <Text variant="muted">Already have an account?</Text>
        <Button title="Sign in" variant="ghost" onPress={() => router.replace("/sign-in")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  // Pinned to the foot of the screen when the form is short.
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 4, marginTop: "auto", paddingTop: 16 },
  link: { textDecorationLine: "underline" },
});
