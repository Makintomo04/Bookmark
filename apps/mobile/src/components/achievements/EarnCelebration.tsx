import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { finishLine } from "@bookmark/shared/earnMoment";
import { READER_TIERS } from "@bookmark/shared/readerTier";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useEarnMoment } from "@/lib/earnMoment";
import { useTheme } from "@/lib/theme";
import { MEDAL_INK, Medal, getMedalColour } from "./Medal";

// The moment a save earns something (the web's EarnCelebration): the medal or a tier-up, with confetti,
// and where a finished book leaves the reader. A finish without a medal gets a short banner instead.
export function EarnCelebration() {
  return (
    <>
      <MedalMoment />
      <FinishBanner />
    </>
  );
}

function MedalMoment() {
  const { colors } = useTheme();
  const { moment, clear } = useEarnMoment();
  if (!moment || moment.medals.length === 0) return null;

  // A tier-up leads with the Books read rung it landed on; otherwise the first medal leads.
  const lead = (moment.tier && moment.medals.find((m) => m.achievementKey === "BOOKS_READ")) || moment.medals[0];
  const others = moment.medals.filter((m) => m !== lead);
  const tier = moment.tier ? READER_TIERS.find((t) => t.key === moment.tier!.key) : null;
  const line = finishLine(moment);
  const heading = tier ? "New reader tier" : others.length > 0 ? `${moment.medals.length} medals earned` : "Medal earned";

  return (
    <Modal transparent animationType="fade" visible onRequestClose={clear}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={clear} />
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]} accessibilityViewIsModal>
          <Text variant="small" style={{ letterSpacing: 1.5, fontWeight: "600" }}>{heading.toUpperCase()}</Text>
          {tier ? (
            <View style={{ width: 80, height: 80, borderRadius: 18, overflow: "hidden" }}>
              <Svg viewBox="0 0 10 10" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="tier-up" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={tier.light} />
                    <Stop offset="0.45" stopColor={tier.colour} />
                    <Stop offset="1" stopColor={tier.shade} />
                  </LinearGradient>
                </Defs>
                <Rect width="10" height="10" fill="url(#tier-up)" />
              </Svg>
            </View>
          ) : (
            <Medal achievementKey={lead.achievementKey} earned size={96} />
          )}
          <Text variant="display" style={{ textAlign: "center" }}>{tier ? `${tier.label} reader` : lead.title}</Text>
          <Text variant="muted" style={{ textAlign: "center" }}>
            {tier ? `Your avatar now wears a ${tier.label} frame, and you earned ${lead.title}.` : `${lead.achievementTitle}: ${lead.description.charAt(0).toLowerCase()}${lead.description.slice(1)}.`}
          </Text>
          {others.length > 0 && (
            <View style={styles.others}>
              {others.map((m) => (
                <View key={m.key} style={[styles.otherPill, { borderColor: colors.border }]}>
                  <Medal achievementKey={m.achievementKey} earned size={24} />
                  <Text variant="small" style={{ color: colors.foreground }}>{m.title}</Text>
                </View>
              ))}
            </View>
          )}
          {line && (
            <View style={[styles.line, { backgroundColor: colors.muted }]}>
              <Text variant="small" style={{ color: colors.foreground, textAlign: "center" }}>{line}</Text>
            </View>
          )}
          <View style={{ alignSelf: "stretch", gap: 8, marginTop: 4 }}>
            <Button title="Lovely" onPress={clear} />
            <Button title="See all medals" variant="outline" onPress={() => { clear(); router.push("/achievements" as never); }} />
          </View>
        </View>
        <Confetti colours={Array.from(new Set(moment.medals.map((m) => getMedalColour(m.achievementKey))))} />
      </View>
    </Modal>
  );
}

const PIECES = 44;

// Pieces falling from above the card in the medals' colours, once. Skipped when the phone asks for
// reduced motion.
function Confetti({ colours }: { colours: string[] }) {
  const { width, height } = useWindowDimensions();
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
  }, []);

  const pieces = useMemo(() => Array.from({ length: PIECES }, (_, i) => ({
    x: Math.random() * width,
    drift: (Math.random() - 0.5) * 120,
    size: 6 + Math.random() * 6,
    delay: Math.random() * 350,
    duration: 1800 + Math.random() * 900,
    spin: Math.random() > 0.5 ? 1 : -1,
    colour: [...colours, MEDAL_INK][i % (colours.length + 1)],
    fall: new Animated.Value(0),
  })), [colours, width]);

  const started = useRef(false);
  useEffect(() => {
    if (reduce !== false || started.current) return;
    started.current = true;
    Animated.parallel(pieces.map((p) => Animated.timing(p.fall, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }))).start();
  }, [reduce, pieces]);

  if (reduce !== false) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: -20,
            width: p.size,
            height: p.size * 0.6,
            borderRadius: 1,
            backgroundColor: p.colour,
            opacity: p.fall.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.fall.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { translateX: p.fall.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.fall.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin * 540}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// "Finished · 18 of 52 books in 2026 · 6 more books to Book Devourer", for a few seconds.
function FinishBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { note, clearNote } = useEarnMoment();
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(clearNote, 5000);
    return () => clearTimeout(timer);
  }, [note, clearNote]);
  if (!note) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Finished. ${note}. Dismiss`}
      onPress={clearNote}
      style={[styles.banner, { bottom: insets.bottom + 16, backgroundColor: colors.foreground }]}
    >
      <Text style={{ color: colors.background, fontWeight: "600" }}>Finished</Text>
      <Text style={{ color: colors.background, opacity: 0.85, fontSize: 13 }}>{note}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 24, alignItems: "center", gap: 12 },
  others: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  otherPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingLeft: 3, paddingRight: 10 },
  line: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  banner: { position: "absolute", left: 16, right: 16, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
});
