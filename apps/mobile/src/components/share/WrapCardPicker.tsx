import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Crown } from "lucide-react-native";
import {
  CARD_DESIGNS,
  CARD_DESIGN_KEYS,
  CARD_KINDS,
  CARD_KIND_LABEL,
  CARD_SIZES,
  CARD_SIZE_KEYS,
  DEFAULT_CARD_DESIGN,
  cardFileName,
  cardMonths,
  cardPath,
  cardProfilePath,
  cardTitle,
  cardToday,
  cardYears,
  type CardDesign,
  type CardKind,
  type CardSize,
} from "@bookmark/shared/wrapCards";
import { FEATURE_COPY } from "@bookmark/shared/entitlements";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";
import { ShareImageSheet } from "./ShareImageSheet";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The whole year, or one of its months that has started (1 to 12), newest first.
const monthOptions = (year: number, today: { year: number; month: number }) => [
  { key: 0, label: year === today.year ? "So far" : "All year" },
  ...cardMonths(year, today).map((m) => ({ key: m, label: MONTHS[m - 1].slice(0, 3) })),
];

function Pills<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string; plus?: boolean }[]; onChange: (key: T) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityLabel={label}>
      {options.map((o) => {
        const current = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            accessibilityLabel={o.plus ? `${o.label}, Plus` : o.label}
            onPress={() => onChange(o.key)}
            style={[styles.pill, { borderColor: colors.border }, current && { backgroundColor: colors.foreground, borderColor: colors.foreground }]}
          >
            <Text variant="label" style={{ color: current ? colors.background : colors.mutedForeground }}>{o.label}</Text>
            {o.plus && <Crown size={12} color={current ? colors.background : colors.mutedForeground} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Wrap cards (BOO-50, the web's WrapCardMaker on /stats): the cover grid or the stats card for a month
// or a year, in 9:16, 4:5 or 1:1. The web draws it; ShareImageSheet saves it to Photos or shares it.
// Midnight is free; the other designs are Plus (`wrapDesigns` from /api/stats).
// `today`: this year and month in the profile's time zone, from /api/stats (the server counts finishes in it);
// the phone's own calendar only if the server didn't send it. `years`: the years with stats, for how far back.
export function WrapCardPicker({ accent, wrapDesigns, today: given, years }: { accent: string; wrapDesigns: boolean; today?: { year: number; month: number }; years: number[] }) {
  const { colors } = useTheme();
  const username = useAuth((s) => s.user?.username ?? null);
  const today = useMemo(() => given ?? cardToday(Intl.DateTimeFormat().resolvedOptions().timeZone), [given]);
  const yearOptions = useMemo(() => cardYears(today, years), [today, years]);
  const [year, setYear] = useState(today.year);
  // 0 for the whole year; this month first, as before.
  const [monthKey, setMonthKey] = useState(today.month);
  const [kind, setKind] = useState<CardKind>("grid");
  const [size, setSize] = useState<CardSize>("story");
  const [design, setDesign] = useState<CardDesign>(DEFAULT_CARD_DESIGN);
  const [upsell, setUpsell] = useState(false);
  const [open, setOpen] = useState(false);

  const month = monthKey === 0 ? null : monthKey;
  const current = year === today.year && (month === null || month === today.month);
  const name = month === null ? String(year) : `${MONTHS[month - 1]} ${year}`;
  // A year with fewer months started keeps the pick in range.
  const pickYear = (y: number) => {
    setYear(y);
    if (monthKey > cardMonths(y, today).length) setMonthKey(0);
  };
  // Marked ?from=card, so a sign-up that starts from the shared link is counted (shared/signupSource.ts).
  const profileUrl = username ? webUrl(cardProfilePath(username)) : webUrl("/");
  const { width, height } = CARD_SIZES[size];
  // "My October in books": the same words the card puts at its top.
  const title = cardTitle(year, month === null ? null : month - 1, current);

  const pickDesign = (key: CardDesign) => {
    if (CARD_DESIGNS[key].plus && !wrapDesigns) {
      setUpsell(true);
      return;
    }
    setUpsell(false);
    setDesign(key);
  };

  return (
    <View style={[styles.box, { backgroundColor: colors.muted, borderLeftColor: accent }]}>
      <View style={{ gap: 2 }}>
        <Text variant="label">Wrap cards</Text>
        <Text variant="muted">Every cover you finished, or your numbers, sized for TikTok, Reels and Instagram.</Text>
      </View>
      <Pills label="Year" value={year} onChange={pickYear} options={yearOptions.map((y) => ({ key: y, label: String(y) }))} />
      <Pills label="Month" value={monthKey} onChange={setMonthKey} options={monthOptions(year, today)} />
      <Pills label="Card" value={kind} onChange={setKind} options={CARD_KINDS.map((k) => ({ key: k, label: CARD_KIND_LABEL[k] }))} />
      <Pills label="Size" value={size} onChange={setSize} options={CARD_SIZE_KEYS.map((k) => ({ key: k, label: `${CARD_SIZES[k].label} ${CARD_SIZES[k].short}` }))} />
      <Pills label="Design" value={design} onChange={pickDesign} options={CARD_DESIGN_KEYS.map((k) => ({ key: k, label: CARD_DESIGNS[k].label, plus: CARD_DESIGNS[k].plus && !wrapDesigns }))} />
      {upsell && (
        <View style={{ gap: 8 }}>
          <Text variant="small">{FEATURE_COPY.customWrapDesigns.message}</Text>
          <Button title="Bookmark Plus" variant="outline" onPress={() => router.push("/plus")} />
        </View>
      )}
      <Button title="Make my card" accessibilityLabel={`Make my ${name} card`} onPress={() => setOpen(true)} />
      {open && (
        <ShareImageSheet
          onClose={() => setOpen(false)}
          image={{
            title,
            imagePath: cardPath({ kind, size, design, year, month }),
            fileName: cardFileName({ kind, size, year, month }) + (design === DEFAULT_CARD_DESIGN ? "" : `-${design}`),
            aspect: width / height,
            hasRatings: true,
            leftOutPath: `/api/wrap/left-out?year=${year}${month === null ? "" : `&month=${month}`}`,
            link: { label: "Share the link to your profile", url: profileUrl, message: `${title} ${profileUrl}` },
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 16, borderRadius: 12, borderLeftWidth: 3 },
  pills: { gap: 8 },
  pill: { flexDirection: "row", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
});
