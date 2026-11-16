import { useRef, useState } from "react";
import { Platform, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { brand } from "@bookmark/shared/tokens";
import { RATING_STEP, snapRating, starClip } from "@bookmark/shared/rating";
import { useTheme } from "@/lib/theme";
import { Text } from "@/components/ui/Text";

// Quarter-star ratings from 0.25 to 5, as on the web. Tap or drag along the stars to set how much of them
// fills, by quarters; the number beside them follows the finger, and the rating is set on release. Tapping
// the current rating again clears it. Stars are the brand mark colour.
const STAR = "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z";
const GAP = 4;
// How far a finger moves before a touch counts as a drag rather than a tap.
const SLOP = 6;

function Star({ fill, size, empty }: { fill: number; size: number; empty: string }) {
  const id = `star${size}-q${Math.round(fill * 4)}`;
  // The gradient runs across the path's own box, and goes by area so ¼ looks like a quarter.
  const at = starClip(fill);
  return (
    // No touches on the drawing, so they all land on the row and are measured from it.
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <Stop offset={at} stopColor={brand.DEFAULT} />
          <Stop offset={at} stopColor={empty} />
        </LinearGradient>
      </Defs>
      <Path d={STAR} fill={fill === 1 ? brand.DEFAULT : fill > 0 ? `url(#${id})` : empty} />
    </Svg>
  );
}

// The rating at x across the row, in quarters. Each gap counts with the star to its left, so the row has
// no dead spots, and anything past either end is a quarter or five.
export function ratingAt(x: number, size: number) {
  const slot = size + GAP;
  const n = Math.min(4, Math.max(0, Math.floor(x / slot)));
  const across = Math.min(1, Math.max(0, (x - n * slot) / size));
  return n + Math.min(4, Math.max(1, Math.ceil(across * 4))) * RATING_STEP;
}

export function StarRating({ value, onChange, size = 32, disabled, label = "Rating" }: { value: number; onChange?: (value: number) => void; size?: number; disabled?: boolean; label?: string }) {
  const { colors } = useTheme();
  // The rating under the finger while it's down; null when nothing is being rated.
  const [live, setLive] = useState<number | null>(null);
  // Where the row's left edge is on the page, and how the touch has moved, for the touch in progress.
  const touch = useRef({ down: false, left: 0, startX: 0, startY: 0, dragging: false });
  const shown = live ?? value;
  const stars = [1, 2, 3, 4, 5];

  // On the web build a touch can come through as a mouse event with offsetX instead of locationX.
  const pageX = (e: GestureResponderEvent) => e.nativeEvent.pageX;
  const locationX = (e: GestureResponderEvent) => e.nativeEvent.locationX ?? (e.nativeEvent as unknown as MouseEvent).offsetX;
  const at = (e: GestureResponderEvent) => ratingAt(pageX(e) - touch.current.left, size);

  const grant = (e: GestureResponderEvent) => {
    // The touch lands on the row itself (the stars take none), so locationX is from its left edge. Moves
    // are measured by pageX from there, wherever the finger goes.
    const x = locationX(e);
    if (!Number.isFinite(x) || !Number.isFinite(pageX(e))) return;
    touch.current = { down: true, left: pageX(e) - x, startX: pageX(e), startY: e.nativeEvent.pageY, dragging: false };
    setLive(ratingAt(x, size));
  };
  const move = (e: GestureResponderEvent) => {
    const t = touch.current;
    if (!t.down) return;
    if (!t.dragging && Math.abs(pageX(e) - t.startX) > SLOP && Math.abs(pageX(e) - t.startX) > Math.abs(e.nativeEvent.pageY - t.startY)) t.dragging = true;
    setLive(at(e));
  };
  const release = (e: GestureResponderEvent) => {
    if (!touch.current.down) return;
    touch.current.down = false;
    const next = Number.isFinite(pageX(e)) ? at(e) : (live ?? value);
    setLive(null);
    // A tap on the current rating clears it; a drag that ends where it started keeps it.
    onChange?.(!touch.current.dragging && next === value ? 0 : next);
  };

  const active = !!onChange && !disabled;
  const adjust = (by: number) => {
    if (active) onChange?.(value + by <= 0 ? 0 : snapRating(Math.min(5, value + by)));
  };
  return (
    // One element for screen readers, read-only or not: editable, it's an adjustable control that a swipe up
    // or down moves by a quarter star (the touch row inside is hidden from them).
    <View
      accessible
      accessibilityRole={onChange ? "adjustable" : "text"}
      accessibilityLabel={onChange ? label : `${label}: ${value ? `${value} out of 5` : "none"}`}
      accessibilityValue={onChange ? { min: 0, max: 5, now: value, text: value ? `${value} out of 5` : "Not rated" } : undefined}
      accessibilityState={onChange ? { disabled: !!disabled } : undefined}
      accessibilityActions={onChange ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      onAccessibilityAction={(e) => adjust(e.nativeEvent.actionName === "increment" ? RATING_STEP : -RATING_STEP)}
      style={styles.row}
    >
      {onChange ? (
        <View
          // One touch target for the whole row. Until the finger has moved sideways, a scroll can take the
          // touch over, so a vertical swipe that starts on the stars still scrolls the page; once it's a
          // drag, it keeps it. On the web build, pan-y leaves vertical scrolling to the browser and stops a
          // sideways drag from scrolling or going back.
          pointerEvents="box-only"
          importantForAccessibility="no-hide-descendants"
          hitSlop={4}
          onStartShouldSetResponder={() => active}
          onResponderGrant={grant}
          onResponderMove={move}
          onResponderRelease={release}
          onResponderTerminationRequest={() => !touch.current.dragging}
          onResponderTerminate={() => {
            touch.current.down = false;
            setLive(null);
          }}
          style={[styles.stars, Platform.OS === "web" && webStars]}
        >
          {stars.map((n) => (
            <Star key={n} fill={Math.max(0, Math.min(1, shown - (n - 1)))} size={size} empty={colors.muted} />
          ))}
        </View>
      ) : (
        stars.map((n) => <Star key={n} fill={Math.max(0, Math.min(1, value - (n - 1)))} size={size} empty={colors.muted} />)
      )}
      {/* The exact value, since at this size 3.75 and 4 look alike. The row's label already reads it out. */}
      {onChange ? <Text variant="muted" style={styles.value} importantForAccessibility="no" aria-hidden>{shown ? shown : "Not rated"}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: GAP },
  stars: { flexDirection: "row", gap: GAP },
  value: { marginLeft: 8, fontVariant: ["tabular-nums"] },
});

// Web-only styles that React Native's types don't know.
const webStars = { touchAction: "pan-y", userSelect: "none", cursor: "pointer" } as object;
