import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import useSWR from "swr";
import { Plus } from "lucide-react-native";
import { GENRE_PICKS_SHELF_LIMIT } from "@bookmark/shared/genres";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { GenrePicks } from "@/components/discover/GenrePicks";
import { FollowRequests } from "@/components/library/FollowRequests";
import { GoalCard } from "@/components/library/GoalCard";
import { NotificationBell } from "@/components/social/NotificationBell";
import { Shelves } from "@/components/library/Shelves";
import { ProfileHeader, type ProfileUser } from "@/components/profile/ProfileHeader";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api";
import { useBooks } from "@/lib/books";
import { useTheme } from "@/lib/theme";

// Your library: your own profile, as on the web (/u/<you>). Header, this year's goal, then the shelves.
// Reviews, lists, medals and follow requests follow in the port.
export default function Library() {
  const { colors } = useTheme();
  const { data: user, mutate: refreshUser } = useSWR<ProfileUser>("/api/user");
  const { data: books, error, isLoading, mutate } = useBooks();
  const accent = user?.favColour || DEFAULT_COLOUR;
  const refreshing = false;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void mutate(); void refreshUser(); }} tintColor={colors.mutedForeground} />}
      >
        <View style={styles.topBar}>
          <NotificationBell color="#ffffff" />
        </View>
        {user && <ProfileHeader user={user} />}
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
        {books && books.length === 0 && (
          <View style={{ gap: 6 }}>
            <Text variant="title">Your shelves are empty</Text>
            <Text variant="muted">Add the book you{"’"}re reading, or import your Goodreads or StoryGraph shelves from the web.</Text>
          </View>
        )}
        <NewShelfPicks bookCount={books?.length} />
        {books && books.length > 0 && <Shelves books={books} accent={accent} />}
      </ScrollView>
    </SafeAreaView>
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
  // Sits over the banner's top-right corner.
  topBar: { position: "absolute", top: 8, right: 8, zIndex: 1, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 20 },
});
