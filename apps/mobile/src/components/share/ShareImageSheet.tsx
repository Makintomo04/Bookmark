import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Share, StyleSheet, Switch, View } from "react-native";
import { Image } from "expo-image";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import useSWR from "swr";
import { Check, Download, Link2, Share2 } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { apiFetch } from "@/lib/api";
import { useTheme } from "@/lib/theme";

// Save or share a card the web draws (a Wrapped story, a monthly Wrap card, a medal) as a real image,
// so nobody has to rebuild it in another app. The image is fetched with the reader's token, kept in the
// cache folder, previewed here, then saved to Photos or handed to the share sheet. The link is a
// separate, labelled button, so it's clear which one posts a picture.

export interface ShareImage {
  title: string;
  // API path of the PNG (the web route); `&ratings=hide` is added when the reader hides their stars.
  imagePath: string;
  // File name stem in the cache folder: "bookmark-wrap-2026-10".
  fileName: string;
  // Width over height, for the preview: 9 / 16 for a story, 1200 / 630 for a medal card.
  aspect: number;
  // The card shows a star rating that the reader may want off it.
  hasRatings?: boolean;
  // API path that says how many private books the card leaves out (/api/wrap/left-out).
  leftOutPath?: string;
  link: { label: string; url: string; message: string };
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const withRatings = (path: string, hide: boolean) => (hide ? `${path}${path.includes("?") ? "&" : "?"}ratings=hide` : path);

async function download(path: string, name: string): Promise<string> {
  const res = await apiFetch(path, { headers: { accept: "image/png" } });
  if (!res.ok) throw new Error(res.status === 404 ? "There's nothing to draw for this yet." : "We couldn't make the image. Try again in a moment.");
  const file = new File(Paths.cache, `${name}.png`);
  if (file.exists) file.delete();
  file.create();
  await file.write(await res.arrayBuffer());
  return file.uri;
}

export function ShareImageSheet({ image, onClose }: { image: ShareImage; onClose: () => void }) {
  const { colors, radii } = useTheme();
  const [hideRatings, setHideRatings] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const { data: leftOut } = useSWR<{ privateBooks: number }>(image.leftOutPath ?? null);
  // Saving and sharing a file need the native modules; a browser build shares the link only.
  const native = Platform.OS !== "web";

  useEffect(() => {
    if (!native) return;
    let live = true;
    setUri(null);
    setLoadError(null);
    setStatus({ kind: "idle" });
    // A new name per variant, so the preview never shows the other version from the image cache.
    download(withRatings(image.imagePath, hideRatings), `${image.fileName}${hideRatings ? "-no-ratings" : ""}`)
      .then((u) => live && setUri(u))
      .catch((e: unknown) => live && setLoadError(e instanceof Error ? e.message : "We couldn't make the image."));
    return () => {
      live = false;
    };
  }, [image.imagePath, image.fileName, hideRatings, native]);

  const save = async () => {
    if (!uri) return;
    setStatus({ kind: "saving" });
    try {
      // Add-only access: Bookmark never reads the reader's photos.
      const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
      if (!permission.granted) {
        setStatus({ kind: "error", message: "Bookmark needs permission to add photos. You can allow it in your phone's Settings." });
        return;
      }
      await MediaLibrary.Asset.create(uri);
      setStatus({ kind: "saved" });
    } catch {
      setStatus({ kind: "error", message: "Couldn't save to Photos. Try again, or use Share image." });
    }
  };

  const shareImage = async () => {
    if (!uri) return;
    await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: image.title }).catch(() => {});
  };

  const shareLink = () => void Share.share({ message: image.link.message, url: image.link.url }).catch(() => {});
  const privateBooks = leftOut?.privateBooks ?? 0;

  return (
    <Sheet title={image.title} onClose={onClose}>
      <View style={{ gap: 16 }}>
        {native && (
          <View style={[styles.preview, { aspectRatio: image.aspect, maxHeight: image.aspect < 1 ? 360 : undefined, borderRadius: radii.lg, backgroundColor: colors.muted, borderColor: colors.border }]}>
            {uri ? (
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`Preview of ${image.title}`} />
            ) : loadError ? (
              <Text variant="muted" style={{ textAlign: "center", padding: 16 }}>{loadError}</Text>
            ) : (
              <ActivityIndicator color={colors.mutedForeground} accessibilityLabel="Making the image" />
            )}
          </View>
        )}

        {privateBooks > 0 && (
          <Text variant="small" style={{ textAlign: "center" }}>
            {privateBooks === 1 ? "1 private book is left out of this card." : `${privateBooks.toLocaleString("en-GB")} private books are left out of this card.`}
          </Text>
        )}

        {image.hasRatings && native && (
          <View style={styles.toggle}>
            <Text style={{ flex: 1 }} nativeID="hide-ratings">Hide my star rating</Text>
            <Switch accessibilityLabelledBy="hide-ratings" accessibilityLabel="Hide my star rating" value={hideRatings} onValueChange={setHideRatings} />
          </View>
        )}

        {status.kind === "error" && <Notice tone="error" message={status.message} />}
        {status.kind === "saved" && (
          <View accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.saved}>
            <Check size={16} color={colors.foreground} />
            <Text variant="label">Saved to Photos</Text>
          </View>
        )}

        {native && (
          <>
            <Button title="Save to Photos" icon={<Download size={16} color={colors.onBrand} />} loading={status.kind === "saving"} disabled={!uri} onPress={() => void save()} />
            <Button title="Share image" variant="outline" icon={<Share2 size={16} color={colors.foreground} />} disabled={!uri} onPress={() => void shareImage()} />
          </>
        )}
        <Button title={image.link.label} variant={native ? "ghost" : "primary"} icon={<Link2 size={16} color={native ? colors.brandText : colors.onBrand} />} onPress={shareLink} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { width: "100%", alignSelf: "center", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  saved: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
