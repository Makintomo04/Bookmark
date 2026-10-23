import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { readableInk } from "@bookmark/shared/colour";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// A book's cover at 2:3, or a card in the book's colour with its title when there's no image (the
// web's BookCover).
export function BookCover({ book, width, fallbackColour, style }: {
  book: { title: string; author: string; coverImage?: string | null; cardColour?: string | null };
  width: number;
  fallbackColour?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii, fonts } = useTheme();
  const [failed, setFailed] = useState(false);
  const background = book.cardColour || fallbackColour || "#3f3f46";
  const small = width < 90;
  return (
    <View style={[styles.cover, { width, height: width * 1.5, borderRadius: radii.sm, backgroundColor: colors.muted }, style]}>
      {book.coverImage && !failed ? (
        <Image source={{ uri: book.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.card, { backgroundColor: background, padding: small ? 6 : 10 }]}>
          <Text numberOfLines={small ? 5 : 6} style={{ color: readableInk(background), fontFamily: fonts.sansSemibold, fontSize: small ? 11 : 15, lineHeight: small ? 13 : 18 }}>{book.title}</Text>
          {!small && <Text numberOfLines={2} style={{ color: readableInk(background), fontSize: 12, opacity: 0.8 }}>{book.author}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: "hidden" },
  card: { justifyContent: "space-between" },
});
