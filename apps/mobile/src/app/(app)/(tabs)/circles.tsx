import { useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { Plus } from "lucide-react-native";
import { circleStanding, formatPercent } from "@bookmark/shared/buddyReads";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { AppBar } from "@/components/ui/AppBar";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Divider, SectionHeading, cardStyle } from "@/components/ui/Section";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { refreshAfterBookChange } from "@/lib/books";
import type { CircleInvite, CircleList, CircleSummary } from "@/lib/circles";
import { ClubsSection } from "@/components/clubs/ClubsSection";
import { useTheme } from "@/lib/theme";
import { StaffSeal } from "@/components/profile/StaffSeal";

// Your reading circles and the invites waiting for you (the web's /circles): invites first, since they
// wait on you, then clubs, the circles you're reading now and the finished ones.
export default function Circles() {
  const { colors } = useTheme();
  const { data, error, isLoading, mutate } = useSWR<CircleList>("/api/buddy-reads");
  const active = data?.buddyReads.filter((c) => !circleStanding(c).finished) ?? [];
  const past = data?.buddyReads.filter((c) => circleStanding(c).finished) ?? [];
  const blocked = !!data?.hosting && !data.hosting.allowed;

  return (
    <Screen>
      <AppBar />
      <View style={{ gap: 6 }}>
        <Text variant="display" accessibilityRole="header">Reading circles</Text>
        <Text variant="muted">Read a book with friends at your own pace. Comments stay locked until you reach them.</Text>
      </View>
      {blocked && data?.hosting?.message ? <Notice message={data.hosting.message} /> : null}
      {/* At the limit: the Plus screen when Plus lifts it, rather than a dead button (BOO-94); otherwise it stays off. */}
      <Button
        title="Start a reading circle"
        variant="inverse"
        icon={<Plus size={18} color={colors.background} />}
        disabled={blocked && !data?.hosting?.upgrade}
        onPress={() => router.push((blocked ? "/plus" : "/circles/new") as never)}
      />
      {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
      {error && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="We couldn't load your reading circles. Check your connection." />
          <Button title="Try again" variant="outline" onPress={() => mutate()} />
        </View>
      )}
      {data && data.invites.length > 0 && (
        <View style={styles.section}>
          <SectionHeading title="Invites" total={data.invites.length} />
          {data.invites.map((invite) => <InviteRow key={invite.id} invite={invite} onChange={() => mutate()} />)}
        </View>
      )}
      <Divider style={styles.rule} />
      <ClubsSection />
      {data && (active.length > 0 || past.length > 0 || data.invites.length === 0) && <Divider style={styles.rule} />}
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
    <View style={styles.section}>
      <SectionHeading title={title} total={circles.length} />
      {circles.map((circle) => <CircleRow key={circle.id} circle={circle} />)}
    </View>
  );
}

function CircleRow({ circle }: { circle: CircleSummary }) {
  const { colors, radii } = useTheme();
  const others = circle.members.length - 1;
  const percent = Math.max(0, Math.min(100, Math.round(circle.myProgress ?? 0)));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${circle.title}, you're at ${formatPercent(circle.myProgress)}`}
      onPress={() => router.push(`/circles/${circle.id}`)}
      style={({ pressed }) => [styles.row, cardStyle(colors, radii.lg, pressed, colors.muted)]}
    >
      <BookCover book={{ title: circle.title, author: circle.author, coverImage: circle.coverImage, cardColour: circle.cardColour }} width={56} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="title" numberOfLines={2} style={{ fontSize: 16, lineHeight: 22 }}>{circle.title}</Text>
        <Text variant="muted" numberOfLines={1}>{circle.club ? circle.club.name : circle.isHost ? "You host" : "Reading along"} · {others > 0 ? `with ${others} ${others === 1 ? "other" : "others"}` : "just you so far"}</Text>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.brand }]} />
        </View>
        <View style={styles.foot}>
          <View style={styles.avatars}>
            {circle.members.slice(0, 6).map((m, i) => (
              <View key={m.userId} style={i > 0 && styles.overlap}>
                <Avatar image={m.image} name={m.username} colour={m.favColour} size={22} ring />
              </View>
            ))}
          </View>
          <Text variant="small">You{"’"}re at {formatPercent(circle.myProgress)}</Text>
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
    <View style={[styles.row, cardStyle(colors, radii.lg), { alignItems: "stretch", flexDirection: "column" }]}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <BookCover book={{ title: invite.buddyRead.title, author: invite.buddyRead.author, coverImage: invite.buddyRead.coverImage, cardColour: invite.buddyRead.cardColour }} width={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" numberOfLines={2} style={{ fontSize: 16, lineHeight: 22 }}>{invite.buddyRead.title}</Text>
          <Text variant="muted">{readerName(invite.inviter) || "A reader"}{invite.inviter.staffBadge ? <StaffSeal kind={invite.inviter.staffBadge} size={14} pressable={false} style={styles.seal} /> : null} asked you to read along</Text>
        </View>
      </View>
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Join" variant="inverse" loading={busy === "join"} disabled={!!busy} onPress={join} /></View>
        <View style={{ flex: 1 }}><Button title="Decline" variant="outline" loading={busy === "decline"} disabled={!!busy} onPress={decline} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  section: { gap: 12 },
  rule: { marginVertical: 8 },
  row: { flexDirection: "row", gap: 14, padding: 12, alignItems: "center" },
  track: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 6 },
  fill: { height: 4, borderRadius: 2 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  avatars: { flexDirection: "row" },
  overlap: { marginLeft: -6 },
});
