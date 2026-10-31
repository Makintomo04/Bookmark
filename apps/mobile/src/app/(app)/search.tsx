import { useEffect, useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import type { Person } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// Finding readers by name or @handle (the web's reader search). A followers-only reader still shows up so
// they can be followed; their bio stays with their followers. Each result says why it might be someone
// you know, and the list pages past the first 20.
type Found = Person & { username: string; bio: string | null; isFollowing: boolean; reason: string | null };
type Page = { readers: Found[]; hasMore: boolean };

export default function SearchReaders() {
  const { colors, radii } = useTheme();
  const username = useAuth((s) => s.user?.username ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const q = query.trim().replace(/^@/, "");

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setHasMore(false);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api.get<Page>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((page) => { if (live) { setResults(page.readers); setHasMore(page.hasMore); } })
        .catch(() => { if (live) { setResults([]); setHasMore(false); } })
        .finally(() => live && setSearching(false));
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api.get<Page>(`/api/users/search?q=${encodeURIComponent(q)}&offset=${results.length}`)
      .then((page) => { setResults((shown) => [...shown, ...page.readers.filter((r) => !shown.some((s) => s.username === r.username))]); setHasMore(page.hasMore); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  // Private profiles never turn up, so the way to reach a friend who isn't found is your own link.
  const invite = () => {
    if (!username) return;
    // The profile itself: one address for the link in bio and the invite (signed out, it offers to join).
    const url = webUrl(`/u/${encodeURIComponent(username)}`);
    void Share.share({ message: `Come and read with me on Bookmark ${url}`, url }).catch(() => {});
  };

  return (
    <Screen scroll={false}>
      <TextField label="Find readers" value={query} onChangeText={setQuery} placeholder="Search by name or username" autoCapitalize="none" autoCorrect={false} autoFocus />
      {searching && <ActivityIndicator color={colors.mutedForeground} />}
      <FlatList
        data={results}
        keyExtractor={(r) => r.username}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={q.length >= 2 && !searching ? <Text variant="muted">Nobody by that name. Private profiles don't show up here.</Text> : undefined}
        ListFooterComponent={
          <View style={styles.footer}>
            {hasMore && <Button title="Show more readers" variant="outline" loading={loadingMore} onPress={loadMore} />}
            {username && (
              <View style={[styles.invite, { borderColor: colors.border, borderRadius: radii.lg }]}>
                <Text variant="label">Can't find them?</Text>
                <Text variant="muted">Send them your link. It opens your profile, where they can join and follow you.</Text>
                <Button title="Share my invite link" variant="outline" onPress={invite} />
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/u/${encodeURIComponent(item.username)}`)}
            style={({ pressed }) => [styles.row, { borderRadius: radii.md, backgroundColor: pressed ? colors.muted : "transparent" }]}
          >
            <Avatar image={item.image} name={item.username} colour={item.favColour} size={40} />
            <View style={{ flex: 1 }}>
              <Text>{readerName(item)}{item.staffBadge ? <StaffSeal kind={item.staffBadge} size={16} pressable={false} style={styles.seal} /> : null}{item.displayName ? <Text variant="small"> @{item.username}</Text> : null}{item.isFollowing ? <Text variant="small"> · following</Text> : null}</Text>
              {item.reason ? <Text variant="small" numberOfLines={1}>{item.reason}</Text> : item.bio ? <Text variant="small" numberOfLines={1}>{item.bio}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Inline in the name's line, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  row: { flexDirection: "row", gap: 12, alignItems: "center", padding: 8 },
  footer: { gap: 16, paddingTop: 12, paddingBottom: 24 },
  invite: { gap: 8, padding: 16, borderWidth: 1, borderStyle: "dashed" },
});
