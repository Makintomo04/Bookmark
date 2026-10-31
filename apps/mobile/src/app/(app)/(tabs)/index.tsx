import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import useSWR, { mutate as globalMutate } from "swr";
import { Compass, Plus } from "lucide-react-native";
import { GENRE_PICKS_SHELF_LIMIT } from "@bookmark/shared/genres";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { GenrePicks } from "@/components/discover/GenrePicks";
import { staffBadgeOf } from "@bookmark/shared/staffBadge";
import { OwnAuthors } from "@/components/authors/ProfileAuthors";
import { FollowRequests } from "@/components/library/FollowRequests";
import { GoalCard } from "@/components/library/GoalCard";
import { NotificationBell } from "@/components/social/NotificationBell";
import { SelectionBar } from "@/components/library/SelectionBar";
import { SeriesTracker } from "@/components/library/SeriesTracker";
import { Shelves, useBookSelection } from "@/components/library/Shelves";
import { ProfileHeader, type ProfileUser } from "@/components/profile/ProfileHeader";
import { AiLabel } from "@/components/ui/AiLabel";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api";
import { FOLLOWED_AUTHORS_KEY } from "@/lib/authors";
import { useBooks } from "@/lib/books";
import { SERIES_TRACKER_KEY } from "@/lib/series";
import { useTheme } from "@/lib/theme";

// Your library: your own profile, as on the web (/u/<you>). Header, this year's goal, then the shelves.
// Reviews, lists, medals and follow requests follow in the port.
export default function Library() {
  const { colors } = useTheme();
  const { data: user, mutate: refreshUser } = useSWR<ProfileUser & { role?: string | null; isStaff?: boolean | null; hideStaffBadge?: boolean | null }>("/api/user");
  const { data: books, error, isLoading, mutate } = useBooks();
  const accent = user?.favColour || DEFAULT_COLOUR;
  const refreshing = false;
  const selection = useBookSelection();
  const picked = (books ?? []).filter((b) => selection.picked.has(b.id));

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, selection.selecting && { paddingBottom: 200 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void mutate(); void refreshUser(); void globalMutate(FOLLOWED_AUTHORS_KEY); void globalMutate(SERIES_TRACKER_KEY); }} tintColor={colors.mutedForeground} />}
      >
        <View style={styles.topBar}>
          <NotificationBell color="#ffffff" />
        </View>
        {user && <ProfileHeader user={user} staffBadge={staffBadgeOf(user)} />}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}><Button title="Add a book" icon={<Plus size={18} color={colors.onBrand} />} onPress={() => router.push("/add-book")} /></View>
          <View style={{ flex: 1 }}><Button title="Edit profile" variant="outline" onPress={() => router.push("/profile/edit")} /></View>
        </View>
        <FollowRequests />
        <GoalCard accent={accent} />
        {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
        {error && (
          <View style={{ gap: 8 }}>
            <Notice tone="error" message="We couldn't load your shelves. Check your connection." />
            <Button title="Try again" variant="outline" onPress={() => mutate()} />
          </View>
        )}
        {books && books.length === 0 && <EmptyLibrary />}
        <NewShelfPicks bookCount={books?.length} />
        {books && books.length > 0 && (
          <View style={{ gap: 12 }}>
            <View style={{ alignItems: "flex-end" }}>
              <Button title={selection.selecting ? "Done" : "Select"} variant="ghost" onPress={selection.selecting ? selection.stop : selection.start} />
            </View>
            <Shelves books={books} accent={accent} selection={selection} />
          </View>
        )}
        {books && books.length > 0 && <SeriesTracker accent={accent} />}
        <OwnAuthors />
      </ScrollView>
      {selection.selecting && <SelectionBar selected={picked} onDone={selection.clear} onCancel={selection.stop} />}
    </SafeAreaView>
  );
}

// An empty library points somewhere to start, not only to import (BOO-52): the first-book picker, Discover,
// and Ask the shelf, which is labelled as AI.
function EmptyLibrary() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <Text variant="title">Your shelves are empty</Text>
        <Text variant="muted">Not sure what to read? We{"’"}ll suggest a few from the genres you picked and the people you follow. Or bring your Goodreads or StoryGraph shelves over.</Text>
      </View>
      <Button title="Help me pick a book" icon={<Compass size={18} color={colors.onBrand} />} onPress={() => router.push("/first-book")} />
      <View style={styles.actions}>
        <View style={{ flex: 1 }}><Button title="Browse Discover" variant="outline" onPress={() => router.navigate("/discover")} /></View>
        <View style={{ flex: 1 }}><Button title="Import" variant="outline" onPress={() => router.push("/import")} /></View>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="Ask the shelf, uses AI" onPress={() => router.push("/discover/ask")} style={styles.ask} hitSlop={6}>
        <Text variant="small">Or ask the shelf in your own words</Text>
        <AiLabel />
      </Pressable>
    </View>
  );
}

// Somewhere to start while the shelf is still new: popular books in the genres picked at setup, above
// the shelves (the web's NewShelfPicks). Whether it shows is settled once per visit, so adding a few
// picks in a row doesn't pull it away at the fifth; Hide applies straight away and sticks on every device.
function NewShelfPicks({ bookCount }: { bookCount: number | undefined }) {
  const { data: user, mutate } = useSWR<{ hideShelfPicks?: boolean | null }>("/api/user");
  const [isNew, setIsNew] = useState<boolean | null>(null);
  useEffect(() => {
    if (isNew === null && bookCount !== undefined) setIsNew(bookCount < GENRE_PICKS_SHELF_LIMIT);
  }, [bookCount, isNew]);
  if (!isNew || !user || user.hideShelfPicks) return null;

  const hide = async () => {
    void mutate({ ...user, hideShelfPicks: true }, { revalidate: false });
    try {
      await api.patch("/api/user/privacy", { hideShelfPicks: true });
    } catch {
      void mutate(user, { revalidate: false });
    }
  };
  return <GenrePicks placement="shelf" onHide={() => void hide()} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: "row", gap: 10 },
  ask: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  // Sits over the banner's top-right corner.
  topBar: { position: "absolute", top: 8, right: 8, zIndex: 1, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 20 },
});
