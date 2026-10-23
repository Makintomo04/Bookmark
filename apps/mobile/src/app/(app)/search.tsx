import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Avatar } from "@/components/profile/Avatar";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { api } from "@/lib/api";
import type { Person } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// Finding readers by username (the web's user search). A followers-only reader still shows up so they
// can be followed; their bio stays with their followers.
type Found = Person & { username: string; bio: string | null; isFollowing: boolean };

export default function SearchReaders() {
  const { colors, radii } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const q = query.trim().replace(/^@/, "");

  useEffect(() => {
    if (q.length < 2) return setResults([]);
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api.get<Found[]>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((found) => live && setResults(found))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  return (
    <Screen scroll={false}>
      <TextField label="Find readers" value={query} onChangeText={setQuery} placeholder="Search by username" autoCapitalize="none" autoCorrect={false} autoFocus />
      {searching && <ActivityIndicator color={colors.mutedForeground} />}
      <FlatList
        data={results}
        keyExtractor={(r) => r.username}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={q.length >= 2 && !searching ? <Text variant="muted">Nobody by that name.</Text> : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/u/${encodeURIComponent(item.username)}`)}
            style={({ pressed }) => [styles.row, { borderRadius: radii.md, backgroundColor: pressed ? colors.muted : "transparent" }]}
          >
            <Avatar image={item.image} name={item.username} colour={item.favColour} size={40} />
            <View style={{ flex: 1 }}>
              <Text>{item.username}{item.isFollowing ? <Text variant="small"> · following</Text> : null}</Text>
              {item.bio ? <Text variant="small" numberOfLines={1}>{item.bio}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center", padding: 8 },
});
