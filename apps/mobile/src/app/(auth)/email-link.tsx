import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { emailSchema } from "@bookmark/shared/authSchemas";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { requestEmailLink } from "@/lib/auth";

// Sign in with a link instead of a password. The link opens the app (src/app/open/signin.tsx) and
// creates the account if there isn't one, like the web's.
export default function EmailLink() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
    setBusy(true);
    setError(null);
    try {
      await requestEmailLink(parsed.data);
      setSentTo(parsed.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't reach Bookmark. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <Screen>
        <Text variant="display">Check your inbox</Text>
        <Text>We sent a sign-in link to {sentTo}. Open it on this phone.</Text>
        <Text variant="muted">It works once and expires in 1 hour. Can{"’"}t find it? Check your spam folder. No account yet? The link creates one.</Text>
        <Button title="Use a different email" variant="ghost" onPress={() => setSentTo(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="display">Sign in with a link</Text>
      <Text variant="muted">We{"’"}ll email you a link that signs you in. No password needed.</Text>
      {error && <Notice tone="error" message={error} />}
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        <Button title="Email me a link" loading={busy} onPress={submit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
