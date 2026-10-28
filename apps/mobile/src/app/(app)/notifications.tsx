import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR, { mutate as revalidate } from "swr";
import { getAchievementTitle } from "@bookmark/shared/achievements-catalog";
import { reviewHiddenMessage } from "@bookmark/shared/reviewReports";
import { seriesNewsText } from "@bookmark/shared/series";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { refreshAfterBookChange } from "@/lib/books";
import { answerFollowRequest, timeAgo, type Person } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// Notifications (the web's bell, as a screen). Opening it marks them read. Follow requests can be
// answered here, and a book a friend sent can go straight onto Want to read.

interface Notification {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  count: number | null;
  message: string | null;
  achievementKey: string | null;
  actor: Person & { username: string };
  buddyRead: { id: string; title: string; inviteCode: string; status?: string } | null;
  book: { id: string; title: string; author: string; coverImage: string; onShelf: boolean } | null;
  // NEW_IN_SERIES: the new book.
  work?: { title: string; seriesName: string | null; seriesPosition: number | null } | null;
}

// The web's notificationCopy, after the actor's name.
function copyOf(n: Notification) {
  const others = (n.count ?? 1) - 1;
  const book = n.buddyRead?.title ?? "a book";
  switch (n.type) {
    case "NEW_FOLLOWER": return "started following you";
    case "ACHIEVEMENT_EARNED": return `reached the "${getAchievementTitle(n.achievementKey ?? "")}" milestone`;
    case "BUDDY_READ_INVITE": return `invited you to read ${book} together`;
    case "BOOK_RECOMMENDED": return `thinks you'd like ${n.book?.title ?? "a book"}`;
    case "BUDDY_READ_JOINED": return `${others > 0 ? `and ${others} ${others === 1 ? "other" : "others"} ` : ""}joined your reading circle for ${book}`;
    case "BUDDY_READ_HOSTED": return `handed you the reading circle for ${book}. You're the host now`;
    case "FOLLOW_REQUEST": return "asked to follow you";
    default: return "did something";
  }
}

// Where tapping goes. Achievements stay put.
function pathOf(n: Notification): string | null {
  // The app has no page for a book nobody's shelved yet.
  if (n.type === "ACHIEVEMENT_EARNED" || n.type === "NEW_IN_SERIES") return null;
  // Your own copy, where you can still read the review.
  if (n.type === "REVIEW_HIDDEN") return n.book ? `/book/${n.book.id}` : null;
  if (n.type === "BUDDY_READ_INVITE" && n.buddyRead) return `/circles/join/${n.buddyRead.inviteCode}`;
  if (n.buddyRead) return `/circles/${n.buddyRead.id}`;
  return `/u/${encodeURIComponent(n.actor.username)}`;
}

export default function Notifications() {
  const { colors } = useTheme();
  const { data, isLoading, mutate } = useSWR<{ notifications: Notification[]; unreadCount: number }>("/api/notifications");

  // Seen once opened, as when the web's bell opens.
  useEffect(() => {
    if (data && data.unreadCount > 0) {
      api.patch("/api/notifications", { all: true }).then(() => revalidate("/api/notifications")).catch(() => {});
    }
  }, [data]);

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={colors.mutedForeground} /></View>;
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      data={data?.notifications ?? []}
      keyExtractor={(n) => n.id}
      ListEmptyComponent={<Text variant="muted">No notifications yet.</Text>}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
      renderItem={({ item }) => <Row n={item} onChange={() => mutate()} />}
    />
  );
}

function Row({ n, onChange }: { n: Notification; onChange: () => void }) {
  const { colors, fonts } = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const path = pathOf(n);

  const answer = async (action: "accept" | "decline") => {
    setBusy(true);
    try {
      const result = await answerFollowRequest(n.actor.username, action);
      if (result.accepted) setNote(`${n.actor.username} can now see your profile.`);
      onChange();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : "Couldn't answer that request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const addRecommended = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ added: boolean }>(`/api/recommendations/${n.id}`);
      setNote(result.added ? "Added to Want to read" : "Already on your shelf");
      await refreshAfterBookChange();
      onChange();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : "Couldn't add that book.");
    } finally {
      setBusy(false);
    }
  };

  const text =
    n.type === "COMMENTS_UNLOCKED" ? `${n.count ?? 1} ${n.count === 1 ? "comment" : "comments"} to read in ${n.buddyRead?.title ?? "your reading circle"}`
    : n.type === "BUDDY_READ_HOST_INHERITED"
      ? n.buddyRead?.status === "ARCHIVED"
        ? `The host of ${n.buddyRead?.title ?? "a reading circle"} closed their account. It's yours now, archived until you have room to reopen it.`
        : `You're now hosting ${n.buddyRead?.title ?? "a reading circle"}: its host closed their account.`
      // Moderation, so nobody is named: not the reporter, not the librarian.
      : n.type === "REVIEW_HIDDEN" ? reviewHiddenMessage(n.book?.title ?? null)
      : n.type === "NEW_IN_SERIES" ? seriesNewsText({ title: n.work?.title ?? null, seriesName: n.work?.seriesName ?? null, position: n.work?.seriesPosition ?? null, count: n.count })
      : null;

  return (
    <View style={[styles.row, !n.read && { backgroundColor: colors.muted }]}>
      <Pressable accessibilityRole={path ? "link" : "text"} disabled={!path} onPress={() => path && router.push(path as never)} style={styles.main}>
        <Avatar image={n.actor.image} name={n.actor.username} colour={n.actor.favColour} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          {text ? <Text>{text}</Text> : <Text><Text style={{ fontFamily: fonts.sansSemibold }}>{n.actor.username}</Text> {copyOf(n)}</Text>}
          {n.type === "BOOK_RECOMMENDED" && n.message ? <Text variant="muted" style={{ fontStyle: "italic" }}>{"“"}{n.message}{"”"}</Text> : null}
          <Text variant="small">{timeAgo(n.createdAt)}{n.type === "BOOK_RECOMMENDED" && n.book?.onShelf ? " · on your shelf" : ""}</Text>
        </View>
      </Pressable>
      {n.type === "FOLLOW_REQUEST" && !note && (
        <View style={styles.actions}>
          <Button title="Accept" loading={busy} onPress={() => answer("accept")} />
          <Button title="Decline" variant="outline" disabled={busy} onPress={() => answer("decline")} />
        </View>
      )}
      {n.type === "BOOK_RECOMMENDED" && n.book && !n.book.onShelf && !note && (
        <View style={styles.actions}><Button title="Add to Want to read" variant="ghost" loading={busy} onPress={addRecommended} /></View>
      )}
      {note && <Text variant="small" style={{ paddingLeft: 48 }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16 },
  row: { gap: 8, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  main: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: 10, paddingLeft: 48 },
  separator: { height: StyleSheet.hairlineWidth },
});
