import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { signInWithEmailLink, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

// Where an emailed sign-in link opens the app: https://<site>/open/signin?token=…&email=… as a universal
// or app link, or bookmark://signin/link?… from the button on that web page. Spends the token once.
export function EmailLinkLanding() {
  const { token, email } = useLocalSearchParams<{ token?: string; email?: string }>();
  const completeSignIn = useAuth((s) => s.completeSignIn);
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token || !email) {
      setError("This sign-in link is incomplete. Ask for a new one.");
      return;
    }
    signInWithEmailLink(email, token)
      .then(async (response) => {
        await completeSignIn(response);
        router.replace("/");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "We couldn't reach Bookmark. Check your connection and open the link again."));
  }, [token, email, completeSignIn]);

  return (
    <Screen>
      {error ? (
        <View style={{ gap: 16 }}>
          <Text variant="display">That link didn{"’"}t work</Text>
          <Text>{error}</Text>
          <Button title="Back to sign in" onPress={() => router.replace("/")} />
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={colors.mutedForeground} />
          <Text variant="muted">Signing you in…</Text>
        </View>
      )}
    </Screen>
  );
}
