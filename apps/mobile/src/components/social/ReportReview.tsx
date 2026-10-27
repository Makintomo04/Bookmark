import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { REVIEW_REPORT_REASONS } from "@bookmark/shared/reviewReports";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";

// Report someone's review, like the reading circle's ReportComment: a "Report" ghost button that opens a
// row of reasons. `bookId` is the reviewer's copy of the book, where the review lives (the web's
// ReportReviewButton). The server refuses your own review and any you can't see.
export function ReportReview({ bookId }: { bookId: string }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) return <Text variant="small">Thanks. The Bookmark team will take a look; nobody else can see that you reported it.</Text>;
  if (!open) return <View style={styles.start}><Button title="Report" variant="ghost" onPress={() => setOpen(true)} /></View>;

  const send = async (reason: string) => {
    setSending(reason);
    setError(null);
    try {
      await api.post(`/api/books/${bookId}/review-report`, { reason });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the report. Try again.");
      setSending(null);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">What's wrong with it?</Text>
      <View style={styles.reasons}>
        {REVIEW_REPORT_REASONS.map((reason) => <Chip key={reason} label={sending === reason ? "Sending…" : reason} selected={false} disabled={!!sending} onPress={() => send(reason)} />)}
      </View>
      {error && <Text variant="small">{error}</Text>}
      <View style={styles.start}><Button title="Cancel" variant="ghost" disabled={!!sending} onPress={() => setOpen(false)} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
