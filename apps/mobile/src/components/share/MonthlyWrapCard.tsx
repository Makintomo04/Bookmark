import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";
import { ShareImageSheet } from "./ShareImageSheet";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The last twelve months, newest first, in the phone's calendar.
function recentMonths(now = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, name: MONTHS[d.getMonth()] };
  });
}

// A monthly Wrap card (the web's MonthlyWrapCards on /stats), free for everyone: pick a month, then save
// the 1080×1920 story image from /api/wrap/monthly to Photos or share it.
export function MonthlyWrapCard({ accent }: { accent: string }) {
  const { colors } = useTheme();
  const username = useAuth((s) => s.user?.username ?? null);
  const months = useMemo(() => recentMonths(), []);
  const [picked, setPicked] = useState(0);
  const [open, setOpen] = useState(false);
  const { year, month, name } = months[picked];
  const profileUrl = username ? webUrl(`/u/${encodeURIComponent(username)}`) : webUrl("/");
  const stamp = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <View style={[styles.box, { backgroundColor: colors.muted, borderLeftColor: accent }]}>
      <View style={{ gap: 2 }}>
        <Text variant="label">Monthly Wrap card</Text>
        <Text variant="muted">One month of reading, ready for your story.</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityLabel="Month">
        {months.map((m, i) => {
          const current = i === picked;
          return (
            <Pressable key={`${m.year}-${m.month}`} accessibilityRole="button" accessibilityState={{ selected: current }} accessibilityLabel={`${m.name} ${m.year}`} onPress={() => setPicked(i)} style={[styles.pill, { borderColor: colors.border }, current && { backgroundColor: colors.foreground, borderColor: colors.foreground }]}>
              <Text variant="label" style={{ color: current ? colors.background : colors.mutedForeground }}>{m.year === months[0].year ? m.name.slice(0, 3) : `${m.name.slice(0, 3)} ${m.year}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button title={`Make my ${name} card`} onPress={() => setOpen(true)} />
      {open && (
        <ShareImageSheet
          onClose={() => setOpen(false)}
          image={{
            title: `Your ${name} ${year}`,
            imagePath: `/api/wrap/monthly?year=${year}&month=${month}`,
            fileName: `bookmark-wrap-${stamp}`,
            aspect: 9 / 16,
            hasRatings: true,
            leftOutPath: `/api/wrap/left-out?year=${year}&month=${month}`,
            link: { label: "Share the link to your profile", url: profileUrl, message: `My ${name} in books ${profileUrl}` },
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 16, borderRadius: 12, borderLeftWidth: 3 },
  pills: { gap: 8 },
  pill: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
});
