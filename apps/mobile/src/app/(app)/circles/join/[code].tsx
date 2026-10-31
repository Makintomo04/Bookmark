import { useEffect, useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { refreshAfterBookChange } from "@/lib/books";
import { useTheme } from "@/lib/theme";
import { StaffSeal } from "@/components/profile/StaffSeal";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";

// An invite link (https://<site>/circles/join/<code>, handed to the app): the book, who's in, and Join.
// Members go straight to the circle, as on the web. A club's book is joined through its club, so its link
// opens the club's invite instead.

type Invite = {
  buddyRead: { title: string; author: string; coverImage: string | null; cardColour: string | null };
  host: { username: string | null; displayName?: string | null; staffBadge?: StaffBadgeKind | null } | null;
  members: { username: string | null; image: string | null; favColour: string | null }[];
  memberCount?: number;
  full: boolean;
  viewer: { isMember: boolean; buddyReadId: string | null; removed: boolean; removedMessage: string | null };
  clubInviteCode?: string | null;
};

export default function JoinCircle() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors } = useTheme();
  const { data, error, isLoading } = useSWR<Invite>(`/api/buddy-reads/join?code=${encodeURIComponent(code ?? "")}`);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.viewer.isMember && data.viewer.buddyReadId) router.replace(`/circles/${data.viewer.buddyReadId}`);
    else if (data?.clubInviteCode) router.replace(`/clubs/join/${data.clubInviteCode}`);
  }, [data]);

  if (isLoading || data?.clubInviteCode) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
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
      const result = await api.post<{ buddyReadId: string }>("/api/buddy-reads/join", { code });
      await refreshAfterBookChange();
      router.replace(`/circles/${result.buddyReadId}`);
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : "Couldn't join. Try again.");
      setJoining(false);
    }
  };

  return (
    <Screen>
      <View style={styles.center}>
        <BookCover book={data.buddyRead} width={128} />
        <Text variant="small" style={{ letterSpacing: 1 }}>READING CIRCLE</Text>
        <Text variant="display" style={{ textAlign: "center" }}>{data.buddyRead.title}</Text>
        <Text variant="muted">{data.buddyRead.author}</Text>
        <View style={styles.avatars}>
          {data.members.slice(0, 8).map((m, i) => <Avatar key={i} image={m.image} name={m.username} colour={m.favColour} size={36} ring />)}
        </View>
        <Text style={{ textAlign: "center" }}>
          {(data.host && readerName(data.host)) || "A reader"}{data.host?.staffBadge ? <StaffSeal kind={data.host.staffBadge} size={16} pressable={false} style={styles.seal} /> : null} invited you to read along{others > 0 ? ` with ${others} ${others === 1 ? "other" : "others"}` : ""}.
        </Text>
        <Text variant="muted" style={{ textAlign: "center" }}>
          Everyone{"’"}s progress in one place, in any edition or on audio. Comments are pinned to where they were written and stay locked until you get there.
        </Text>
      </View>
      {data.viewer.removed ? (
        <Notice message={data.viewer.removedMessage ?? "You can't rejoin this reading circle."} />
      ) : data.full ? (
        <Notice message="This reading circle is full." />
      ) : (
        <>
          {joinError && <Notice tone="error" message={joinError} />}
          <Button title="Join the reading circle" loading={joining} onPress={join} />
          <Text variant="small" style={{ textAlign: "center" }}>The book goes on your Currently reading shelf if it isn{"’"}t there already.</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  center: { alignItems: "center", gap: 10 },
  avatars: { flexDirection: "row", gap: -8, marginVertical: 4 },
});
