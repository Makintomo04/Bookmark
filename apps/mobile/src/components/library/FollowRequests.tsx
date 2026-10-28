import { useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { answerFollowRequest, type Person } from "@/lib/social";
import { useTheme } from "@/lib/theme";

type Request = { id: string; createdAt: string; requester: Person & { username: string } };

// Readers asking to follow your followers-only or private profile (the web's FollowRequests).
export function FollowRequests() {
  const { colors, radii } = useTheme();
  const { data, mutate } = useSWR<Request[]>("/api/follow-requests");
  if (!data || data.length === 0) return null;
  return (
    <View style={[styles.box, { borderRadius: radii.lg, borderColor: colors.border }]}>
      <Text variant="title">Follow requests</Text>
      {data.map((r) => <RequestRow key={r.id} request={r} onDone={() => mutate()} />)}
    </View>
  );
}

function RequestRow({ request, onDone }: { request: Request; onDone: () => void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { username } = request.requester;
  const answer = async (action: "accept" | "decline") => {
    setBusy(action);
    setError(null);
    try {
      await answerFollowRequest(username, action);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't answer that request. Try again.");
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${encodeURIComponent(username)}`)} style={styles.who}>
        <Avatar image={request.requester.image} name={username} colour={request.requester.favColour} size={32} />
        <Text style={{ flex: 1 }}>{readerName(request.requester)} asked to follow you</Text>
      </Pressable>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}><Button title="Accept" loading={busy === "accept"} disabled={!!busy} onPress={() => answer("accept")} /></View>
        <View style={{ flex: 1 }}><Button title="Decline" variant="outline" loading={busy === "decline"} disabled={!!busy} onPress={() => answer("decline")} /></View>
      </View>
      {error && <Text variant="small">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 16, gap: 14 },
  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 10 },
});
