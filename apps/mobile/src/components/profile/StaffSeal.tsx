import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { STAFF_BADGE, type StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// The staff seal (packages/shared/src/staffBadge.ts), the web's StaffSeal: on the avatar where it's big,
// beside the name where it isn't. Pressing it says what the role is.
// cutOut draws a ring in the page colour round the seal, to lift it off an avatar. name is who the sheet says holds the role. pressable={false} for a
// seal inside something pressable (a notification row): it only marks the role. shine sweeps a band of light
// across it once on arrival, then on press, never on a loop: looping shimmer belongs to the tier frames.
export function StaffSeal({ kind, size, name, cutOut, shine, pressable = true, style }: { kind: StaffBadgeKind; size: number; name?: string | null; cutOut?: boolean; shine?: boolean; pressable?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const badge = STAFF_BADGE[kind];
  const sweep = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  const play = (delay = 0) => {
    sweep.setValue(0);
    Animated.timing(sweep, { toValue: 1, duration: 900, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  // The one sweep on arrival, once the screen has settled, unless the reader asked for less motion.
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (!live) return;
      setReduce(r);
      if (shine && !r) play(600);
    });
    return () => { live = false; };
  }, [shine]);
  const press = () => {
    setOpen(true);
    if (shine && !reduce) play();
  };
  // The fill's circle inside the "-2 -2 28 28" box: 24 across, 2 in from each edge.
  const fill = (size * 24) / 28;
  const seal = (
    <Svg width={size} height={size} viewBox="-2 -2 28 28">
      {cutOut && <Circle cx={12} cy={12} r={14} fill={colors.background} />}
      <Circle cx={12} cy={12} r={12} fill={badge.colour} />
      <Path d={badge.glyph} fill={badge.ink} />
    </Svg>
  );
  const band = shine && (
    <View pointerEvents="none" style={{ position: "absolute", top: (size * 2) / 28, left: (size * 2) / 28, width: fill, height: fill, borderRadius: fill / 2, overflow: "hidden" }}>
      <Animated.View style={{ position: "absolute", top: -fill * 0.3, left: fill * 0.25, width: fill / 2, height: fill * 1.6, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-fill * 1.5, fill * 1.5] }) }, { rotate: "20deg" }] }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="band" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#fff" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#fff" stopOpacity={0.7} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#band)" />
        </Svg>
      </Animated.View>
    </View>
  );

  if (!pressable) return <View accessible accessibilityRole="image" accessibilityLabel={badge.label} style={style}>{seal}</View>;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={badge.label} accessibilityHint="Says what this role is" onPress={press} hitSlop={8} style={style}>
        {seal}
        {band}
      </Pressable>
      {open && (
        <Sheet title={badge.who(name)} onClose={() => setOpen(false)}>
          <Text variant="muted">{badge.about}</Text>
        </Sheet>
      )}
    </>
  );
}
