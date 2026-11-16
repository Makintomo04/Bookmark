import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import useSWR, { useSWRConfig } from "swr";
import { readerName } from "@bookmark/shared/profile";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { refreshAfterBookChange } from "@/lib/books";
import type { ClubInvite, ClubInviteBook } from "@/lib/clubs";
import { useTheme } from "@/lib/theme";
import { useRemindersPrompt } from "@/lib/earnMoment";
import type { AskReason } from "@bookmark/shared/reminders";

// A club's invite link (https://<site>/clubs/join/<code>, handed to the app): the club, its host, who's in,
// and what it's reading and what's next, then Join. Members go straight to the club, as on the web.

const dayMonth = (date: string) => new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export default function JoinClub() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors, radii } = useTheme();
  const { mutate } = useSWRConfig();
  const { data, error, isLoading } = useSWR<ClubInvite>(`/api/clubs/join?code=${encodeURIComponent(code ?? "")}`);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.viewer.isMember && data.viewer.clubId) router.replace(`/clubs/${data.viewer.clubId}`);
  }, [data]);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) {
    return (
      <Screen>
        <Text variant="display">This invite has expired</Text>
        <Text variant="muted">{error instanceof ApiError ? error.message : "Couldn't load the invite. Check your connection."}</Text>
      </Screen>
    );
  }

  const others = (data.memberCount ?? data.members.length) - 1;
  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const result = await api.post<{ ok: boolean; clubId: string; alreadyMember: boolean; circleIds: string[]; askReminders?: AskReason | false }>("/api/clubs/join", { code });
      // The club's books went on the shelf; its circles find your copy there.
      await refreshAfterBookChange();
      void mutate("/api/clubs");
      void mutate("/api/buddy-reads");
      router.replace(`/clubs/${result.clubId}`);
      // Never offered reminders yet: checkpoints are what a new member needs (RemindersSheet, in the app layout).
      if (result.askReminders) useRemindersPrompt.setState({ asked: result.askReminders });
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : "Couldn't join. Try again.");
      setJoining(false);
    }
  };

  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="small" style={{ letterSpacing: 1 }}>BOOK CLUB</Text>
        <Text variant="display" style={{ textAlign: "center" }}>{data.club.name}</Text>
        {data.club.about ? <Text variant="muted" style={{ textAlign: "center" }}>{data.club.about}</Text> : null}
        <View style={styles.avatars}>
          {data.members.slice(0, 8).map((m, i) => <Avatar key={i} image={m.image} name={m.username} colour={m.favColour} size={36} ring />)}
        </View>
        <Text style={{ textAlign: "center" }}>
          {(data.host && readerName(data.host)) || "A reader"}{data.host?.staffBadge ? <StaffSeal kind={data.host.staffBadge} size={16} pressable={false} style={styles.seal} /> : null} invited you to join the club{others > 0 ? `, with ${others} ${others === 1 ? "other reader" : "other readers"}` : ""}.
          {data.booksRead > 0 ? ` They${"’"}ve read ${data.booksRead} ${data.booksRead === 1 ? "book" : "books"} together so far.` : ""}
        </Text>
      </View>

      {(data.current || data.next) && (
        <View style={[styles.books, { borderRadius: radii.lg, borderColor: colors.border }]}>
          {data.current && <BookLine label="READING NOW" book={data.current} />}
          {data.next && <BookLine label="UP NEXT" book={data.next} />}
        </View>
      )}

      <Text variant="muted" style={{ textAlign: "center" }}>
        Join once and you{"’"}re added to every book the club reads, in any edition or on audio. Comments are pinned to where they were written and stay locked until you get there.
      </Text>

      {data.viewer.removed ? (
        <Notice message={data.viewer.removedMessage ?? "You can't rejoin this club."} />
      ) : data.full ? (
        <Notice message="This club is full." />
      ) : (
        <>
          {joinError && <Notice tone="error" message={joinError} />}
          <Button title="Join the club" loading={joining} onPress={join} />
          {data.current && <Text variant="small" style={{ textAlign: "center" }}>Not on your shelf yet? It{"’"}ll be added to Want to read until you start.</Text>}
        </>
      )}
    </Screen>
  );
}

function BookLine({ label, book }: { label: string; book: ClubInviteBook }) {
  return (
    <View style={styles.bookLine}>
      <BookCover book={book} width={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" style={{ letterSpacing: 1 }}>{label}</Text>
        <Text numberOfLines={2}>{book.title}</Text>
        <Text variant="small" numberOfLines={1}>{book.author} · from {dayMonth(book.startsAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  center: { alignItems: "center", gap: 10 },
  avatars: { flexDirection: "row", gap: -8, marginVertical: 4 },
  books: { gap: 14, padding: 14, borderWidth: 1 },
  bookLine: { flexDirection: "row", alignItems: "center", gap: 12 },
});
