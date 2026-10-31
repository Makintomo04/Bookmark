import { useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { formatPercent } from "@bookmark/shared/buddyReads";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { refreshAfterBookChange } from "@/lib/books";
import type { CircleInvite, CircleList, CircleSummary } from "@/lib/circles";
import { ClubsSection } from "@/components/clubs/ClubsSection";
import { useTheme } from "@/lib/theme";
import { StaffSeal } from "@/components/profile/StaffSeal";

// Your reading circles and the invites waiting for you (the web's /circles).
export default function Circles() {
  const { colors } = useTheme();
  const { data, error, isLoading, mutate } = useSWR<CircleList>("/api/buddy-reads");
  const active = data?.buddyReads.filter((c) => c.status === "ACTIVE") ?? [];
  const past = data?.buddyReads.filter((c) => c.status !== "ACTIVE") ?? [];

  return (
    <Screen>
      <Text variant="display">Reading circles</Text>
      <Text variant="muted">Read with friends at your own pace. Comments stay locked until you reach them.</Text>
      {data?.hosting && !data.hosting.allowed && data.hosting.message ? <Notice message={data.hosting.message} /> : null}
      <Button title="Start a reading circle" disabled={!!data?.hosting && !data.hosting.allowed} onPress={() => router.push("/circles/new")} />
      {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
      {error && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="We couldn't load your reading circles. Check your connection." />
          <Button title="Try again" variant="outline" onPress={() => mutate()} />
        </View>
      )}
      <ClubsSection />
      {data && data.invites.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Invites</Text>
          {data.invites.map((invite) => <InviteRow key={invite.id} invite={invite} onChange={() => mutate()} />)}
        </View>
      )}
      {data && data.buddyReads.length === 0 && data.invites.length === 0 && (
        <Text variant="muted">No circles yet. Start one with the book you{"’"}re reading and share the link.</Text>
      )}
      {active.length > 0 && <Section title="Reading now" circles={active} />}
      {past.length > 0 && <Section title="Finished and archived" circles={past} />}
    </Screen>
  );
}

function Section({ title, circles }: { title: string; circles: CircleSummary[] }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title">{title}</Text>
      {circles.map((circle) => <CircleRow key={circle.id} circle={circle} />)}
    </View>
  );
}

function CircleRow({ circle }: { circle: CircleSummary }) {
  const { colors, radii } = useTheme();
  const others = circle.members.length - 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${circle.title}, you're at ${formatPercent(circle.myProgress)}`}
      onPress={() => router.push(`/circles/${circle.id}`)}
      style={({ pressed }) => [styles.row, { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      <BookCover book={{ title: circle.title, author: circle.author, coverImage: circle.coverImage, cardColour: circle.cardColour }} width={52} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={{ fontSize: 16 }}>{circle.title}</Text>
        <Text variant="small">{circle.club ? circle.club.name : circle.isHost ? "You host" : "Reading along"} · {others > 0 ? `with ${others} ${others === 1 ? "other" : "others"}` : "just you so far"} · you{"’"}re at {formatPercent(circle.myProgress)}</Text>
        <View style={styles.avatars}>
          {circle.members.slice(0, 6).map((m) => <Avatar key={m.userId} image={m.image} name={m.username} colour={m.favColour} size={22} />)}
        </View>
      </View>
    </Pressable>
  );
}

function InviteRow({ invite, onChange }: { invite: CircleInvite; onChange: () => void }) {
  const { colors, radii } = useTheme();
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy("join");
    setError(null);
    try {
      const result = await api.post<{ buddyReadId: string }>("/api/buddy-reads/join", { code: invite.buddyRead.inviteCode });
      await refreshAfterBookChange();
      onChange();
      router.push(`/circles/${result.buddyReadId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't join. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy("decline");
    await api.delete(`/api/buddy-reads/${invite.buddyRead.id}/invite`).catch(() => {});
    setBusy(null);
    onChange();
  };

  return (
    <View style={[styles.row, { borderRadius: radii.lg, borderColor: colors.border, alignItems: "stretch", flexDirection: "column" }]}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <BookCover book={{ title: invite.buddyRead.title, author: invite.buddyRead.author, coverImage: invite.buddyRead.coverImage, cardColour: invite.buddyRead.cardColour }} width={44} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2}>{invite.buddyRead.title}</Text>
          <Text variant="small">{readerName(invite.inviter) || "A reader"}{invite.inviter.staffBadge ? <StaffSeal kind={invite.inviter.staffBadge} size={14} pressable={false} style={styles.seal} /> : null} asked you to read along</Text>
        </View>
      </View>
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Join" loading={busy === "join"} disabled={!!busy} onPress={join} /></View>
        <View style={{ flex: 1 }}><Button title="Decline" variant="outline" loading={busy === "decline"} disabled={!!busy} onPress={decline} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  row: { flexDirection: "row", gap: 12, padding: 12, borderWidth: 1, alignItems: "center" },
  avatars: { flexDirection: "row", gap: 4, marginTop: 2 },
});
