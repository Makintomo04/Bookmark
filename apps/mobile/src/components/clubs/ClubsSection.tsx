import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { Plus, Users } from "lucide-react-native";
import { BookCover } from "@/components/books/BookCover";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import type { ClubList, ClubSummary } from "@/lib/clubs";
import { useTheme } from "@/lib/theme";

const ROLE = { host: "You're hosting", cohost: "Co-host", member: null } as const;
const dayMonth = (date: string) => new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

// On the Circles tab: the reader's clubs, each a group that reads one book after another (the web's
// ClubsSection). "Start a club" shows past the limit too: the form says why.
export function ClubsSection() {
  const { colors } = useTheme();
  const { data } = useSWR<ClubList>("/api/clubs");
  if (!data) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title">Clubs</Text>
      {data.clubs.length === 0 && (
        <Text variant="muted">A club reads one book after another with the same people. Members join once with one link and are added to every new book.</Text>
      )}
      {data.clubs.map((club) => <ClubRow key={club.id} club={club} />)}
      <Button title="Start a club" variant="outline" icon={<Plus size={18} color={colors.foreground} />} onPress={() => router.push("/clubs/new")} />
    </View>
  );
}

function ClubRow({ club }: { club: ClubSummary }) {
  const { colors, radii } = useTheme();
  const book = club.current;
  const line = book ? (book.upcoming ? `Next: ${book.title}, from ${dayMonth(book.startsAt)}` : `Reading ${book.title}`) : "No book yet";
  const role = ROLE[club.role];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${club.name}. ${line}`}
      onPress={() => router.push(`/clubs/${club.id}`)}
      style={({ pressed }) => [styles.row, { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      {book ? (
        <BookCover book={{ title: book.title, author: book.author, coverImage: book.coverImage, cardColour: book.cardColour }} width={44} />
      ) : (
        <View style={[styles.placeholder, { borderRadius: radii.sm, backgroundColor: colors.muted }]}>
          <Users size={18} color={colors.mutedForeground} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 16 }}>{club.name}</Text>
        <Text variant="small" numberOfLines={1}>{line}</Text>
        <Text variant="small">{club.memberCount} {club.memberCount === 1 ? "member" : "members"}{role ? ` · ${role}` : ""}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 12, borderWidth: 1, alignItems: "center" },
  placeholder: { width: 44, aspectRatio: 2 / 3, alignItems: "center", justifyContent: "center" },
});
