import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import useSWR from "swr";
import { genreBySlug } from "@bookmark/shared/genres";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

type DiscoverHome = { genres: { slug: string; label: string }[] };

// Discover's genres, read from /api/discover. The lists, Ask the shelf and search follow in the port.
export default function Discover() {
  const { colors, radii } = useTheme();
  const { data, error, isLoading, mutate } = useSWR<DiscoverHome>("/api/discover");

  return (
    <Screen>
      <Text variant="display">Discover</Text>
      {isLoading && <ActivityIndicator color={colors.mutedForeground} />}
      {error && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message="We couldn't load Discover. Check your connection." />
          <Button title="Try again" variant="outline" onPress={() => mutate()} />
        </View>
      )}
      {data && (
        <View style={styles.grid}>
          {data.genres.map((genre) => (
            <Pressable
              key={genre.slug}
              accessibilityRole="button"
              style={[styles.tile, { borderRadius: radii.lg, backgroundColor: genreBySlug(genre.slug)?.colour ?? colors.muted }]}
            >
              <Text variant="title" style={styles.tileLabel}>{genre.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, minHeight: 72, padding: 14, justifyContent: "flex-end" },
  tileLabel: { color: "#ffffff" },
});
