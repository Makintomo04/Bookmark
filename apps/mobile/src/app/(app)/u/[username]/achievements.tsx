import { useEffect, useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { AchievementDetail, MedalList, ReaderTierCard, type Achievement } from "@/app/(app)/achievements";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { StaffSeal } from "@/components/profile/StaffSeal";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";

// Another reader's tier and medals (the web's /u/<username>/achievements), read-only and without Up next.
// The server applies their profile privacy: a restricted profile sends no medals at all.

type ReaderAchievements = {
  username: string;
  displayName?: string | null;
  staffBadge?: StaffBadgeKind | null;
  restricted: null | "followers" | "private" | "blockedByViewer";
  booksRead: number | null;
  ladders: Achievement[];
  isSelf: boolean;
};

export default function ReaderAchievementsScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors, fonts } = useTheme();
  const { data, error, isLoading } = useSWR<ReaderAchievements>(`/api/users/${encodeURIComponent(username ?? "")}/achievements`);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Your own medals live on the achievements screen, with Up next and your real progress.
  useEffect(() => {
    if (data?.isSelf) router.replace("/achievements");
  }, [data?.isSelf]);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !data) {
    return (
      <Screen>
        <Notice tone="error" message={error instanceof ApiError && error.status === 404 ? "There's nobody with that username." : "Couldn't load their achievements. Check your connection."} />
      </Screen>
    );
  }

  const selected = data.ladders.find((a) => a.key === selectedKey) ?? null;

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{
        title: `${readerName(data)}'s achievements`,
        headerTitle: data.staffBadge ? () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 260 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemibold, fontSize: 17, flexShrink: 1 }}>{readerName(data)}{"'"}s achievements</Text>
            <StaffSeal kind={data.staffBadge!} name={readerName(data)} size={18} />
          </View>
        ) : undefined,
      }} />
      {data.restricted || data.booksRead === null ? (
        <Text variant="muted">
          {data.restricted === "followers" ? `${readerName(data)} shares their achievements with followers.` : data.restricted === "blockedByViewer" ? `You blocked ${readerName(data)}.` : `${readerName(data)} keeps their profile private.`}
        </Text>
      ) : (
        <>
          <ReaderTierCard achievements={data.ladders} reader={{ booksRead: data.booksRead }} />
          <MedalList achievements={data.ladders} onSelect={setSelectedKey} heading="Medals" readOnly />
          {selected && <AchievementDetail achievement={selected} onClose={() => setSelectedKey(null)} readOnly />}
        </>
      )}
    </Screen>
  );
}
