import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { X } from "lucide-react-native";
import { followButtonLabel } from "@bookmark/shared/followRules";
import { feedShowsSuggestions, type PersonSuggestion } from "@bookmark/shared/peopleSuggest";
import { readerName } from "@bookmark/shared/profile";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api";
import { toggleFollow } from "@/lib/social";
import { useTheme } from "@/lib/theme";

type Payload = { people: PersonSuggestion[]; followingCount: number };
type FollowState = { isFollowing: boolean; requested: boolean };

const FEED_SHOWN = 6;

// People you may know (BOO-81, the web's PeopleYouMayKnow): readers to follow, each with why. "find" is
// the list on Find readers before anything's typed; "feed" a few above the feed while you follow only a
// few people. The ✕ dismisses someone for good, and the row offers Undo in its place.
export function PeopleYouMayKnow({ variant }: { variant: "find" | "feed" }) {
  const { colors, radii } = useTheme();
  const { data } = useSWR<Payload>(`/api/users/suggestions?limit=${variant === "feed" ? FEED_SHOWN : 20}`);
  const [state, setState] = useState<Record<string, FollowState>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!data) return null;
  if (variant === "feed" && (!feedShowsSuggestions(data.followingCount) || data.people.length === 0)) return null;
  if (data.people.length === 0) return <Text variant="muted">No suggestions yet. They come from your clubs, your reading circles and the people you follow.</Text>;

  const follow = async (person: PersonSuggestion) => {
    try {
      const result = await toggleFollow(person.username);
      setState((s) => ({ ...s, [person.username]: { isFollowing: result.isFollowing, requested: result.requested } }));
    } catch {
      // The button stays as it was, which says it didn't go through.
    }
  };

  const setHidden = (username: string, hidden: boolean) => {
    setDismissed((d) => { const next = new Set(d); if (hidden) next.add(username); else next.delete(username); return next; });
    const call = hidden ? api.post("/api/users/suggestions/dismiss", { username }) : api.delete("/api/users/suggestions/dismiss", { username });
    call.catch(() => setDismissed((d) => { const next = new Set(d); if (hidden) next.delete(username); else next.add(username); return next; }));
  };

  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">People you may know</Text>
      {data.people.map((person) => {
        if (dismissed.has(person.username)) {
          return (
            <View key={person.username} style={[styles.row, { borderRadius: radii.md }]}>
              <Text variant="small" style={{ flex: 1 }}>We won{"’"}t suggest {readerName(person)} again.</Text>
              <Button title="Undo" variant="ghost" onPress={() => setHidden(person.username, false)} />
            </View>
          );
        }
        const s = state[person.username] ?? { isFollowing: false, requested: false };
        return (
          <View key={person.username} style={[styles.row, { borderRadius: radii.md }]}>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${encodeURIComponent(person.username)}`)} style={styles.person}>
              <Avatar image={person.image} name={person.username} colour={person.favColour} size={40} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{readerName(person)}{person.staffBadge ? <StaffSeal kind={person.staffBadge} size={16} pressable={false} style={styles.seal} /> : null}</Text>
                <Text variant="small" numberOfLines={1}>{person.reason}</Text>
              </View>
            </Pressable>
            <Button
              title={followButtonLabel({ ...s, needsApproval: person.needsApproval, followsYou: person.followsYou })}
              variant={s.isFollowing || s.requested ? "outline" : "primary"}
              onPress={() => void follow(person)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Don't suggest ${readerName(person)}`}
              hitSlop={8}
              onPress={() => setHidden(person.username, true)}
              style={styles.dismiss}
            >
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        );
      })}
      {variant === "feed" && <Button title="See all" variant="ghost" onPress={() => router.push("/search")} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 6 },
  person: { flex: 1, flexDirection: "row", gap: 12, alignItems: "center" },
  // Inline in the name's line, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  dismiss: { padding: 4 },
});
