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
  cardPath,
  cardProfilePath,
  cardTitle,
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

// `current`: the period isn't over yet ("My 2026 so far").
type Period = { year: number; month: number | null; short: string; name: string; current: boolean };

// The last twelve months, newest first, then this year so far and last year, in the phone's calendar.
function periods(now = new Date()): Period[] {
  const year = now.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, now.getMonth() - i, 1);
    const name = MONTHS[d.getMonth()];
    return { year: d.getFullYear(), month: d.getMonth() + 1, short: d.getFullYear() === year ? name.slice(0, 3) : `${name.slice(0, 3)} ${d.getFullYear()}`, name: `${name} ${d.getFullYear()}`, current: i === 0 };
  });
  return [...months, { year, month: null, short: `${year} so far`, name: String(year), current: true }, { year: year - 1, month: null, short: String(year - 1), name: String(year - 1), current: false }];
}

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
export function WrapCardPicker({ accent, wrapDesigns }: { accent: string; wrapDesigns: boolean }) {
  const { colors } = useTheme();
  const username = useAuth((s) => s.user?.username ?? null);
  const options = useMemo(() => periods(), []);
  const [picked, setPicked] = useState(0);
  const [kind, setKind] = useState<CardKind>("grid");
  const [size, setSize] = useState<CardSize>("story");
  const [design, setDesign] = useState<CardDesign>(DEFAULT_CARD_DESIGN);
  const [upsell, setUpsell] = useState(false);
  const [open, setOpen] = useState(false);

  const { year, month, name, current } = options[picked];
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
      <Pills label="Period" value={picked} onChange={setPicked} options={options.map((o, i) => ({ key: i, label: o.short }))} />
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
