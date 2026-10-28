import { useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { REPORT_REASONS } from "@bookmark/shared/listRules";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { addBook } from "@/lib/discover";
import type { Person } from "@/lib/social";
import { useTheme } from "@/lib/theme";

// A list (the web's /lists/<id>): its books with the curator's reasons. Add any book to your shelf,
// copy the whole list to make it your own, or report it. Editing lists stays on the web for now.

type ListItem = { id: string; title: string; author: string; coverUrl: string | null; pages: number | null; workKey: string | null; note: string | null; curator: Person | null };
type ListDetail = {
  id: string;
  title: string;
  description: string | null;
  isPick: boolean;
  owner: Person;
  items: ListItem[];
  isOwner: boolean;
  canCopy: boolean;
  hasReported: boolean;
  remixCount: number;
  forkedFrom: { list: { id: string; title: string; username: string | null } | null } | null;
};

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: list, error, isLoading, mutate } = useSWR<ListDetail>(`/api/lists/${id}`);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !list) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <Text variant="display">List not found</Text>
        <Text variant="muted">It may be private, or it was removed.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <View style={{ gap: 8 }}>
        <Text variant="small" style={{ letterSpacing: 1 }}>{list.isPick ? "BOOKMARK PICK" : "LIST"}</Text>
        <Text variant="display">{list.title}</Text>
        {!list.isPick && list.owner.username && (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${encodeURIComponent(list.owner.username!)}`)} style={styles.owner}>
            <Avatar image={list.owner.image} name={list.owner.username} colour={list.owner.favColour} size={22} />
            <Text variant="muted">by {readerName(list.owner)}</Text>
            {list.owner.staffBadge ? <StaffSeal kind={list.owner.staffBadge} size={18} pressable={false} /> : null}
          </Pressable>
        )}
        {list.forkedFrom?.list && <Text variant="small">Remixed from {list.forkedFrom.list.title}{list.forkedFrom.list.username ? ` by ${list.forkedFrom.list.username}` : ""}</Text>}
        {list.description ? <Text>{list.description}</Text> : null}
        <Text variant="small">{list.items.length} {list.items.length === 1 ? "book" : "books"}{list.remixCount ? ` · remixed ${list.remixCount} ${list.remixCount === 1 ? "time" : "times"}` : ""}</Text>
      </View>

      <ListActions list={list} onChange={() => mutate()} />

      <View style={{ gap: 4 }}>
        {list.items.map((item, i) => (
          <View key={item.id} style={[styles.item, { borderBottomColor: colors.border }]}>
            <Text variant="small" style={{ width: 20 }}>{i + 1}</Text>
            <BookCover book={{ title: item.title, author: item.author, coverImage: item.coverUrl }} width={52} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={2} style={{ fontSize: 16 }}>{item.title}</Text>
              <Text variant="muted" numberOfLines={1}>{item.author}</Text>
              {item.note && (
                <View style={styles.note}>
                  {item.curator && <Avatar image={item.curator.image} name={item.curator.username} colour={item.curator.favColour} size={16} />}
                  <Text variant="small" style={{ flex: 1, fontStyle: "italic" }}>{"“"}{item.note}{"”"}</Text>
                </View>
              )}
              <View style={{ alignItems: "flex-start" }}>
                <Button title="Add to my shelf" variant="ghost" onPress={() => addBook(item)} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function ListActions({ list, onChange }: { list: ListDetail; onChange: () => void }) {
  const [busy, setBusy] = useState<"copy" | "report" | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(list.hasReported);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    setBusy("copy");
    setError(null);
    try {
      const copied = await api.post<{ id: string }>(`/api/lists/${list.id}/copy`);
      router.push(`/lists/${copied.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't copy the list. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const report = async (reason: string) => {
    setBusy("report");
    setError(null);
    try {
      await api.post(`/api/lists/${list.id}/report`, { reason });
      setReported(true);
      setReporting(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the report. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (list.isOwner) return <Notice message="This is your list. You can edit it on the web." />;
  return (
    <View style={{ gap: 8 }}>
      {list.canCopy && <Button title="Copy to my lists" variant="outline" loading={busy === "copy"} onPress={copy} />}
      {reported ? (
        <Text variant="small">You reported this list. The Bookmark team will take a look.</Text>
      ) : reporting ? (
        <View style={{ gap: 8 }}>
          <Text variant="label">What's wrong with it?</Text>
          <View style={styles.reasons}>
            {REPORT_REASONS.map((reason) => <Chip key={reason} label={reason} selected={false} disabled={!!busy} onPress={() => report(reason)} />)}
          </View>
          <Button title="Cancel" variant="ghost" disabled={!!busy} onPress={() => setReporting(false)} />
        </View>
      ) : (
        <Button title="Report this list" variant="ghost" onPress={() => setReporting(true)} />
      )}
      {error && <Text variant="small">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  owner: { flexDirection: "row", alignItems: "center", gap: 8 },
  item: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  note: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
