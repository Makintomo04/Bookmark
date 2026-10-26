import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { setFollowingSeries } from "@/lib/series";

// Follow series / Following series (the web's FollowSeriesButton). Free for every reader.
export function FollowSeries({ name, author, following, refreshKey }: {
  name: string;
  author: string;
  following: boolean;
  // The screen's SWR key, refreshed after the change so `following` comes back updated.
  refreshKey?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setNote(null);
    try {
      await setFollowingSeries({ name, author }, !following, refreshKey);
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : following ? `Couldn't unfollow ${name}. Try again.` : `Couldn't follow ${name}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8, alignItems: "flex-start" }}>
      <Button
        title={following ? "Following series" : "Follow series"}
        variant="outline"
        loading={busy}
        onPress={toggle}
        accessibilityLabel={following ? `Following ${name}` : `Follow ${name}`}
        accessibilityHint={following ? `Unfollows ${name}` : undefined}
      />
      {note ? <Notice tone="error" message={note} /> : null}
    </View>
  );
}
