import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { FOLLOWED_AUTHORS_KEY, type FollowedAuthor } from "@/lib/authors";

// "Authors they follow" on a profile (the web's ProfileAuthors), each opening the author's page, where
// Follow / Following is. Someone else's profile leaves it out when it's empty.
export function ProfileAuthors({ authors, isSelf = false }: { authors: { name: string; slug: string }[]; isSelf?: boolean }) {
  if (authors.length === 0 && !isSelf) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title" accessibilityRole="header">
        {isSelf ? "Authors you follow" : "Authors they follow"} <Text variant="muted">{authors.length}</Text>
      </Text>
      {authors.length === 0 ? (
        <Text variant="muted">Follow an author from their page and they{"’"}ll show here.</Text>
      ) : (
        <View style={styles.chips}>
          {authors.map((author) => (
            <Chip
              key={author.slug}
              label={author.name}
              selected={false}
              accessibilityRole="link"
              accessibilityState={undefined}
              onPress={() => router.push(`/authors/${encodeURIComponent(author.slug)}` as never)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// Your own, on the Library tab.
export function OwnAuthors() {
  const { data } = useSWR<{ authors: FollowedAuthor[] }>(FOLLOWED_AUTHORS_KEY);
  if (!data) return null;
  return <ProfileAuthors authors={data.authors} isSelf />;
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
