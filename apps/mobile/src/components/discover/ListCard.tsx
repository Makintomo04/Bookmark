import { Pressable, StyleSheet, View } from "react-native";
import { readerName } from "@bookmark/shared/profile";
import { router } from "expo-router";
import { BookCover } from "@/components/books/BookCover";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Text } from "@/components/ui/Text";
import type { ListSummary } from "@/lib/discover";
import { useTheme } from "@/lib/theme";

// A list's card: the first covers fanned, its title and its curator (the web's ListCard).
export function ListCard({ list, width = 220 }: { list: ListSummary; width?: number }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${list.title}, ${list.itemCount} ${list.itemCount === 1 ? "book" : "books"}${list.isPick ? ", a Bookmark pick" : list.owner.username ? `, by ${readerName(list.owner)}` : ""}`}
      onPress={() => router.push(`/lists/${list.id}`)}
      style={({ pressed }) => [styles.card, { width, borderRadius: radii.lg, borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.card }]}
    >
      <View style={styles.covers}>
        {list.items.slice(0, 4).map((item, i) => (
          <BookCover key={i} book={{ title: item.title, author: item.author, coverImage: item.coverUrl }} width={(width - 24 - 18) / 4} />
        ))}
      </View>
      <Text numberOfLines={2} style={{ fontSize: 15 }}>{list.title}</Text>
      {/* The seal sits in the line, after the curator's name; the card is pressable, so it only marks the role. */}
      <Text variant="small" numberOfLines={1}>
        {list.isPick ? "Bookmark pick" : list.owner.username ? `by ${readerName(list.owner)}` : "A reader's list"}
        {!list.isPick && list.owner.username && list.owner.staffBadge ? <StaffSeal kind={list.owner.staffBadge} size={14} pressable={false} style={styles.seal} /> : null}
        {" "}· {list.itemCount} {list.itemCount === 1 ? "book" : "books"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Inline in the text, so lifted a touch to sit on the line's middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  card: { padding: 12, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  covers: { flexDirection: "row", gap: 6 },
});
