import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { readableInk } from "@bookmark/shared/colour";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// A reader's picture, or their initial on their colour (the web's InitialAvatar).
export function Avatar({ image, name, colour, size = 40, ring }: { image?: string | null; name?: string | null; colour?: string | null; size?: number; ring?: boolean }) {
  const { colors, fonts } = useTheme();
  const fill = colour || DEFAULT_COLOUR;
  const style = [styles.base, { width: size, height: size, borderRadius: size / 2 }, ring && { borderWidth: 3, borderColor: colors.background }];
  if (image) return <Image source={{ uri: image }} style={style} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[style, { backgroundColor: fill }]}>
      <Text style={{ color: readableInk(fill), fontFamily: fonts.sansSemibold, fontSize: size * 0.42, lineHeight: size * 0.5 }}>
        {(name?.[0] ?? "?").toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
