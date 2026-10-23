import { useState } from "react";
import { Pressable, View } from "react-native";
import useSWR from "swr";
import { EyeOff } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// A review as others see it (the web's ReviewText): one marked as a spoiler stays covered until the
// reader taps it, unless they've asked to always see spoilers. Long ones are shortened until tapped.
export function ReviewText({ review, spoiler, maxChars = 280 }: { review: string; spoiler?: boolean | null; maxChars?: number }) {
  const { colors, radii } = useTheme();
  const { data: settings } = useSWR<{ showSpoilers: boolean }>("/api/user/privacy");
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (spoiler && !revealed && !settings?.showSpoilers) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Review with spoilers. Tap to show it."
        onPress={() => setRevealed(true)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.md, backgroundColor: colors.muted }}
      >
        <EyeOff size={14} color={colors.mutedForeground} />
        <Text variant="muted">Contains spoilers · tap to show</Text>
      </Pressable>
    );
  }
  const long = review.length > maxChars;
  return (
    <View>
      <Text>{long && !expanded ? `${review.slice(0, maxChars).trimEnd()}…` : review}</Text>
      {long && <Text variant="small" style={{ color: colors.brandText }} onPress={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Read more"}</Text>}
    </View>
  );
}
