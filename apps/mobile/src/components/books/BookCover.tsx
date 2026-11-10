import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { coverColour, readableInk, shade } from "@bookmark/shared/colour";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme";

// A book's cover at 2:3, or, with no image, the book drawn as a book (the web's BookFallback): the reader's
// colour for it or one picked from the title and author, a darker spine, a soft sheen, and the title in the
// display serif over a short rule. Type is sized against the width, so one layout works from thumbnails up.
export function BookCover({ book, width, style }: {
  book: { title: string; author: string; coverImage?: string | null; cardColour?: string | null };
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.cover, { width, height: width * 1.5, borderRadius: radii.sm, backgroundColor: colors.muted }, style]}>
      {book.coverImage && !failed ? (
        <Image source={{ uri: book.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <BookFallback title={book.title} author={book.author} colour={book.cardColour} width={width} />
      )}
    </View>
  );
}

function BookFallback({ title, author, colour, width }: { title: string; author: string; colour?: string | null; width: number }) {
  const { fonts } = useTheme();
  const background = colour || coverColour(title, author);
  const ink = readableInk(background);
  // Below this a cover is a thumbnail: the title alone, as on the web's `thumb`.
  const thumb = width < 72;
  const titleSize = Math.max(8, Math.min(22, Math.round(width * (thumb ? 0.15 : 0.12))));
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: background }]}>
      <View style={[styles.spine, { width: Math.max(3, width * 0.07), backgroundColor: shade(background, -0.3) }]} />
      {/* The web's 105° sheen, as two soft washes: light on the spine side, shadow on the fore-edge. */}
      <View style={[styles.sheen, { left: 0, backgroundColor: "rgba(255,255,255,0.08)" }]} />
      <View style={[styles.sheen, { right: 0, backgroundColor: "rgba(0,0,0,0.08)" }]} />
      <View style={[styles.body, { paddingLeft: width * (thumb ? 0.14 : 0.16), paddingRight: width * (thumb ? 0.06 : 0.09), paddingVertical: width * 0.1 }]}>
        <View>
          <Text numberOfLines={5} style={{ color: ink, fontFamily: fonts.display, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.18), letterSpacing: 0 }}>{title}</Text>
          {!thumb && <View style={[styles.rule, { backgroundColor: ink, marginTop: width * 0.08 }]} />}
        </View>
        {!thumb && author ? (
          <Text numberOfLines={2} style={{ color: ink, opacity: 0.8, fontFamily: fonts.sansMedium, fontSize: Math.max(8, Math.min(13, Math.round(width * 0.075))), lineHeight: Math.round(Math.max(8, Math.min(13, width * 0.075)) * 1.3) }}>{author}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: "hidden" },
  spine: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "rgba(255,255,255,0.2)" },
  sheen: { position: "absolute", top: 0, bottom: 0, width: "35%" },
  body: { flex: 1, justifyContent: "space-between" },
  rule: { height: StyleSheet.hairlineWidth * 2, width: "25%", opacity: 0.5 },
});
