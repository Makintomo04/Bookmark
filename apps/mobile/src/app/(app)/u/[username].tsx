import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { Ellipsis, Lock } from "lucide-react-native";
import { progressWhole } from "@bookmark/shared/progress";
import { DEFAULT_COLOUR, readerName } from "@bookmark/shared/profile";
import { followButtonLabel } from "@bookmark/shared/followRules";
import { BookCover } from "@/components/books/BookCover";
import { StarRating } from "@/components/books/StarRating";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { ReviewText } from "@/components/social/ReviewText";
import { ReportReview } from "@/components/social/ReportReview";
import { ProfileAuthors } from "@/components/authors/ProfileAuthors";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { setBlocked, toggleFollow } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// Another reader's profile (the web's /u/<username>), as far as their privacy settings let you see it:
// follow or ask to follow, block, what they're reading, finished books and reviews. Your own goes to
// the library tab.

type PublicBook = {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  cardColour: string | null;
  status: string;
  rating: number | null;
  review: string | null;
  reviewSpoiler: boolean | null;
  pages: number;
  currentPage: number | null;
  progressUnit?: "PAGES" | "MINUTES" | null;
  audioMinutes?: number | null;
  currentMinute?: number | null;
  completedAt: string | null;
};

type Profile = {
  username: string;
  displayName?: string | null;
  image: string | null;
  favColour: string | null;
  staffBadge?: StaffBadgeKind | null;
  bio?: string | null;
  banner?: string;
  books?: PublicBook[];
  followedAuthors?: { name: string; slug: string }[];
  // Earned milestone keys; absent on a restricted profile.
  achievements?: { key: string; earnedAt: string }[];
  followerCount?: number | null;
  followingCount?: number | null;
  restricted: null | "followers" | "private" | "blockedByViewer";
  isFollowing: boolean;
  requested: boolean;
  // They follow you: "Follow back", and "Friends" once you follow each other (shared followRules.ts).
  followsYou?: boolean;
  isSelf: boolean;
  isBlocked: boolean;
};

export default function ReaderProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors } = useTheme();
  const { data: profile, error, isLoading, mutate } = useSWR<Profile>(`/api/users/${encodeURIComponent(username ?? "")}`);

  useEffect(() => {
    if (profile?.isSelf) router.replace("/");
  }, [profile?.isSelf]);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !profile) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <Text variant="display">Reader not found</Text>
        <Text variant="muted">{error instanceof ApiError && error.status === 404 ? "There's nobody with that username." : "Couldn't load this profile. Check your connection."}</Text>
      </Screen>
    );
  }

  const achievementCount = profile.achievements?.length ?? 0;
  const openAchievements = () => router.push(`/u/${encodeURIComponent(profile.username)}/achievements`);

  return (
    <Screen>
      <Stack.Screen options={{ title: readerName(profile) }} />
      <ProfileHeader
        user={{ id: profile.username, name: null, username: profile.username, displayName: profile.displayName ?? null, image: profile.image, banner: profile.banner ?? null, bio: profile.bio ?? null, favColour: profile.favColour, _count: profile.restricted ? undefined : { books: (profile.books ?? []).filter((b) => b.status === "COMPLETED").length } }}
        staffBadge={profile.staffBadge}
        medals={profile.restricted ? undefined : { earned: profile.achievements ?? [], onPress: openAchievements }}
      />
      {profile.followerCount != null && (
        <Text variant="muted">{profile.followerCount.toLocaleString("en-GB")} {profile.followerCount === 1 ? "follower" : "followers"} · {(profile.followingCount ?? 0).toLocaleString("en-GB")} following</Text>
      )}
      {!profile.restricted && (
        <Pressable accessibilityRole="link" onPress={openAchievements}>
          <Text variant="muted">{achievementCount.toLocaleString("en-GB")} {achievementCount === 1 ? "achievement" : "achievements"}</Text>
        </Pressable>
      )}
      <Actions profile={profile} onChange={() => mutate()} />
      {profile.restricted ? <Restricted profile={profile} /> : <Reading profile={profile} />}
      {!profile.restricted && <ProfileAuthors authors={profile.followedAuthors ?? []} />}
    </Screen>
  );
}

function Actions({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { colors } = useTheme();

  const follow = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await toggleFollow(profile.username);
      if (result.requested) setNote(`Asked to follow ${readerName(profile)}. You'll see their profile once they accept.`);
      onChange();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const block = async (blocked: boolean) => {
    setBusy(true);
    try {
      await setBlocked(profile.username, blocked);
      setConfirmBlock(false);
      setMenu(false);
      onChange();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (profile.isBlocked) return null;
  const followTitle = followButtonLabel({ isFollowing: profile.isFollowing, requested: profile.requested, needsApproval: !!profile.restricted, followsYou: profile.followsYou ?? false });
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            title={followTitle}
            variant={profile.isFollowing || profile.requested ? "outline" : "primary"}
            loading={busy}
            onPress={follow}
            accessibilityHint={profile.isFollowing ? "Unfollows" : profile.requested ? "Withdraws your request" : undefined}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu(!menu)} style={[styles.more, { borderColor: colors.input }]}>
          <Ellipsis size={20} color={colors.foreground} />
        </Pressable>
      </View>
      {menu && !confirmBlock && <Button title={`Block ${readerName(profile)}`} variant="ghost" onPress={() => setConfirmBlock(true)} />}
      {confirmBlock && (
        <View style={{ gap: 6 }}>
          <Text>Block {readerName(profile)}? You won{"’"}t see each other{"’"}s profiles, activity or comments, and any follow between you ends. They aren{"’"}t told.</Text>
          <View style={styles.row}>
            <Button title="Block" variant="outline" loading={busy} onPress={() => block(true)} />
            <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => setConfirmBlock(false)} />
          </View>
        </View>
      )}
      {note && <Text variant="small">{note}</Text>}
    </View>
  );
}

function Restricted({ profile }: { profile: Profile }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  if (profile.restricted === "blockedByViewer") {
    return (
      <View style={{ gap: 10 }}>
        <Text>You blocked {readerName(profile)}.</Text>
        <Button
          title="Unblock"
          variant="outline"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await setBlocked(profile.username, false).catch(() => {});
            setBusy(false);
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.locked}>
      <Lock size={18} color={colors.mutedForeground} />
      <Text variant="muted" style={{ flex: 1 }}>
        {profile.restricted === "followers" ? `${readerName(profile)} shares their shelf with followers. Ask to follow to see it.` : `${readerName(profile)} keeps their profile private. Ask to follow: if they accept, you'll see their shelf and reviews.`}
      </Text>
    </View>
  );
}

function Reading({ profile }: { profile: Profile }) {
  const accent = profile.favColour || DEFAULT_COLOUR;
  const books = profile.books ?? [];
  const reading = books.filter((b) => b.status === "STARTED");
  const finished = books.filter((b) => b.status === "COMPLETED");
  const wantToRead = books.filter((b) => b.status === "NOT_STARTED");
  const reviews = finished.filter((b) => b.review);
  if (books.length === 0) return <Text variant="muted">Nothing on their shelf yet.</Text>;
  return (
    <View style={{ gap: 24 }}>
      {reading.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Reading now</Text>
          {reading.map((b) => (
            <View key={b.id} style={styles.readingRow}>
              <BookCover book={b} width={48} fallbackColour={accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2}>{b.title}</Text>
                <Text variant="small">{b.author} · {progressWhole(b)}%</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <CoverRow title="Finished" books={finished} accent={accent} />
      <CoverRow title="Want to read" books={wantToRead} accent={accent} />
      {reviews.length > 0 && (
        <View style={{ gap: 14 }}>
          <Text variant="title">Reviews</Text>
          {reviews.map((b) => (
            <View key={b.id} style={{ gap: 6 }}>
              <View style={styles.readingRow}>
                <BookCover book={b} width={36} fallbackColour={accent} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{b.title}</Text>
                  {b.rating ? <StarRating value={b.rating} size={14} /> : null}
                </View>
              </View>
              <ReviewText review={b.review!} spoiler={b.reviewSpoiler} />
              <ReportReview bookId={b.id} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function CoverRow({ title, books, accent }: { title: string; books: PublicBook[]; accent: string }) {
  if (books.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title">{title} <Text variant="muted">{books.length}</Text></Text>
      <FlatList
        horizontal
        data={books}
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <View style={{ width: 84, gap: 4 }} accessible accessibilityLabel={`${item.title} by ${item.author}`}>
            <BookCover book={item} width={84} fallbackColour={accent} />
            <Text variant="small" numberOfLines={2}>{item.title}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  more: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  locked: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8 },
  readingRow: { flexDirection: "row", gap: 12, alignItems: "center" },
});
