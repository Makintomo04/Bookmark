import { useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Text } from "@/components/ui/Text";
import { bulkBooks, type PickedBook } from "@/lib/books";
import { useTheme } from "@/lib/theme";

const plural = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "book" : "books"}`;

const confirmRemove = (count: number) =>
  new Promise<boolean>((resolve) => {
    const message = `${plural(count)} will come off your shelves, with their ratings, reviews and reading history.`;
    if (Platform.OS === "web") return resolve(window.confirm(`Remove ${plural(count)}? ${message}`));
    Alert.alert(`Remove ${plural(count)}?`, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Remove", style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

// The action bar for the shelf's select mode (the web's BulkBar). Only moves with no read history are offered
// here; starting or finishing a book stays one book at a time. A big selection goes in batches behind one tap.
export function SelectionBar({ selected, onDone, onCancel }: { selected: PickedBook[]; onDone: () => void; onCancel: () => void }) {
  const { colors, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const ids = selected.map((b) => b.id);
  const wanted = selected.filter((b) => b.status === "NOT_STARTED").length;
  const declined = selected.filter((b) => b.status === "NOT_INTERESTED").length;
  const allPrivate = selected.length > 0 && selected.every((b) => b.isPrivate);

  const run = async (body: Record<string, unknown>, done: (data: Record<string, number>) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await bulkBooks(body, ids);
      setMessage({ tone: "info", text: done(data) });
      onDone();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (await confirmRemove(ids.length)) await run({ action: "remove" }, (d) => `Removed ${plural(d.removed ?? ids.length)}`);
  };

  const none = selected.length === 0;
  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radii.lg, bottom: Math.max(insets.bottom, 12) }]}>
      {message && <Notice tone={message.tone} message={message.text} />}
      <Text style={{ fontVariant: ["tabular-nums"] }} accessibilityLiveRegion="polite">{none ? "Select books" : `${plural(selected.length)} selected`}</Text>
      <View style={styles.row}>
        {wanted > 0 && <Button title="Will not read" variant="outline" disabled={busy} onPress={() => run({ action: "notInterested" }, (d) => `Moved ${plural(d.updated ?? 0)} to Will not read`)} />}
        {declined > 0 && <Button title="Want to read" variant="outline" disabled={busy} onPress={() => run({ action: "wantToRead" }, (d) => `Moved ${plural(d.updated ?? 0)} to Want to read`)} />}
        {allPrivate
          ? <Button title="Share on profile" variant="outline" disabled={busy} onPress={() => run({ action: "makePublic" }, (d) => `Shared ${plural(d.updated ?? 0)} on your profile`)} />
          : <Button title="Make private" variant="outline" disabled={busy || none} onPress={() => run({ action: "makePrivate" }, (d) => `Made ${plural(d.updated ?? 0)} private`)} />}
        <Button title="Remove" variant="outline" disabled={busy || none} loading={busy} onPress={remove} />
        <Button title="Done" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 12, right: 12, alignSelf: "center", maxWidth: 720, padding: 12, gap: 8, borderWidth: 1, elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
