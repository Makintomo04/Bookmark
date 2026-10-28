import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import useSWR from "swr";
import { Check } from "lucide-react-native";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api";
import { inviteToCircle, type Friend } from "@/lib/circles";
import { useTheme } from "@/lib/theme";
import { StaffSeal } from "@/components/profile/StaffSeal";

interface FriendsPickerProps {
  circleId: string;
  // Usernames already reading along, shown as such rather than offered.
  memberUsernames: string[];
  // How many more the circle can take.
  room: number;
  onClose: () => void;
}

// Your friends (readers you follow who follow you back) with a tick each, in a sheet (the web's
// FriendsPicker on the invite panel): pick several and invite them in one go. Each invite goes through
// the same route as a typed username on the web, so a friend whose settings don't allow it is refused
// in the same words.
export function FriendsPicker({ circleId, memberUsernames, room, onClose }: FriendsPickerProps) {
  const { colors } = useTheme();
  const { data, isLoading } = useSWR<Friend[]>("/api/friends");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const friends = (data ?? []).filter((f): f is Friend & { username: string } => !!f.username);
  const members = new Set(memberUsernames);

  const toggle = (username: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else if (next.size < room) next.add(username);
      return next;
    });
  };

  const invite = async () => {
    const names = Array.from(picked);
    if (names.length === 0 || busy) return;
    setBusy(true);
    const invited: string[] = [];
    const failed: string[] = [];
    const lines: string[] = [];
    // One at a time: each answer can differ (not taking invites, already here, full).
    for (const name of names) {
      try {
        await inviteToCircle(circleId, name);
        invited.push(name);
      } catch (e) {
        failed.push(name);
        lines.push(`${name}: ${e instanceof ApiError ? e.message : "couldn't send that invite."}`);
      }
    }
    if (invited.length > 0) lines.unshift(invited.length === 1 ? `Invited ${invited[0]}.` : `Invited ${invited.length} friends.`);
    setNotes(lines);
    // The ones that failed stay ticked, so a retry is one tap.
    setPicked(new Set(failed));
    setBusy(false);
  };

  return (
    <Sheet title="Invite friends" onClose={onClose}>
      <View style={{ gap: 12, paddingBottom: 8 }}>
        {isLoading && <Text variant="muted">Loading…</Text>}
        {!isLoading && friends.length === 0 && (
          <Text variant="muted">No friends yet. Friends are readers you follow who follow you back. Share the invite link instead.</Text>
        )}
        {friends.map((friend) => {
          const here = members.has(friend.username);
          const on = picked.has(friend.username);
          return (
            <Pressable
              key={friend.username}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: here }}
              disabled={here || busy || (!on && picked.size >= room)}
              onPress={() => toggle(friend.username)}
              style={[styles.row, here && { opacity: 0.6 }]}
            >
              <Avatar image={friend.image} name={friend.username} colour={friend.favColour} size={36} />
              <Text style={{ flex: 1 }} numberOfLines={1}>{friend.username}{friend.staffBadge ? <StaffSeal kind={friend.staffBadge} size={16} pressable={false} style={styles.seal} /> : null}</Text>
              {here
                ? <Text variant="small">Already here</Text>
                : (
                  <View style={[styles.tick, { borderColor: on ? colors.brandFill : colors.input, backgroundColor: on ? colors.brandFill : "transparent" }]}>
                    {on && <Check size={14} color={colors.onBrand} />}
                  </View>
                )}
            </Pressable>
          );
        })}
        {notes.map((line) => <Text key={line} variant="small">{line}</Text>)}
        {friends.length > 0 && (
          <Button
            title={picked.size <= 1 ? "Invite" : `Invite ${picked.size} friends`}
            loading={busy}
            disabled={picked.size === 0}
            onPress={invite}
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
