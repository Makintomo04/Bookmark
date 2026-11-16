import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Camera, Check } from "lucide-react-native";
import { SWATCHES, normaliseUsername, usernameProblem } from "@bookmark/shared/profile";
import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { pickAndUploadImage } from "@/lib/upload";
import { useTheme } from "@/lib/theme";

// The pieces of a profile form, shared by onboarding (setup) and Edit profile.

// The swatches' names, for screen readers (the web's ColourSwatches).
export const SWATCH_NAMES: Record<string, string> = {
  "#D92D2D": "Red", "#E8590C": "Orange", "#E0A800": "Yellow", "#2F9E44": "Green", "#0C8599": "Teal",
  "#1971C2": "Blue", "#5F3DC4": "Violet", "#C2255C": "Pink", "#495057": "Grey", "#1A1A1A": "Black",
};

export function ColourPicker({ value, onChange }: { value: string; onChange: (colour: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="label">Your colour</Text>
      <View accessibilityRole="radiogroup" style={styles.swatches}>
        {SWATCHES.map((swatch) => (
          <Pressable
            key={swatch}
            accessibilityRole="radio"
            accessibilityLabel={SWATCH_NAMES[swatch] ?? swatch}
            accessibilityState={{ checked: value === swatch }}
            onPress={() => onChange(swatch)}
            style={[styles.swatch, { backgroundColor: swatch, borderColor: value === swatch ? colors.foreground : "transparent" }]}
          >
            {value === swatch && <Check size={16} color="#ffffff" />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// A banner picture, 3:1 like the web's (BOO-99). Without one the profile shows a strip of the reader's colour.
export function BannerUpload({ banner, onChange }: { banner: string | null; onChange: (url: string | null) => void }) {
  const { colors } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    setUploading(true);
    try {
      const url = await pickAndUploadImage([3, 1], "banner");
      if (url) onChange(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't upload that picture. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">Banner · optional</Text>
      <Text variant="small">A picture across the top of your profile. Without one, it's a strip of your colour.</Text>
      <View style={styles.bannerButtons}>
        <Button title={banner ? "Change banner" : "Upload a banner"} variant="outline" loading={uploading} onPress={choose} />
        {banner && <Button title="Remove" variant="ghost" disabled={uploading} onPress={() => onChange(null)} />}
      </View>
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

// A picture to tap to change, with the initial on the reader's colour until there is one.
// `compact` (onboarding's profile preview): the picture alone, its camera badge the way to add one, with
// Change and Remove under it only once there is a picture.
export function PhotoPicker({ image, name, colour, onChange, compact }: { image: string | null; name: string; colour: string; onChange: (url: string | null) => void; compact?: boolean }) {
  const { colors } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    setUploading(true);
    try {
      const url = await pickAndUploadImage([1, 1], "avatar");
      if (url) onChange(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't upload that photo. Try again.");
    } finally {
      setUploading(false);
    }
  };

  if (compact) {
    return (
      <View style={{ gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={image ? "Change profile picture" : "Add a profile picture"} onPress={choose} disabled={uploading} style={{ alignSelf: "flex-start" }}>
          <Avatar image={image} name={name} colour={colour} size={72} ring />
          <View style={[styles.camera, { backgroundColor: colors.foreground }]}>
            {uploading ? <ActivityIndicator size="small" color={colors.background} /> : <Camera size={14} color={colors.background} />}
          </View>
        </Pressable>
        {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.photoRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={image ? "Change profile picture" : "Add a profile picture"} onPress={choose} disabled={uploading}>
        <Avatar image={image} name={name} colour={colour} size={72} ring />
        <View style={[styles.camera, { backgroundColor: colors.foreground }]}>
          {uploading ? <ActivityIndicator size="small" color={colors.background} /> : <Camera size={14} color={colors.background} />}
        </View>
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Button title={image ? "Change photo" : "Add a photo"} variant="ghost" disabled={uploading} onPress={choose} />
        {image && <Button title="Remove photo" variant="ghost" disabled={uploading} onPress={() => onChange(null)} />}
        {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
      </View>
    </View>
  );
}

export type Availability = "idle" | "checking" | "available" | "taken";

// Whether a username is free, checked a moment after typing stops. `current` is the reader's own name,
// which is always theirs to keep.
export function useUsernameAvailability(username: string, current?: string | null) {
  const [availability, setAvailability] = useState<Availability>("idle");
  const name = normaliseUsername(username);
  useEffect(() => {
    if (usernameProblem(name) || (current && name === current.toLowerCase())) return setAvailability("idle");
    setAvailability("checking");
    let live = true;
    const timer = setTimeout(() => {
      api.get<{ available: boolean }>(`/api/new-user?username=${encodeURIComponent(name)}`)
        .then((res) => live && setAvailability(res.available ? "available" : "taken"))
        .catch(() => live && setAvailability("idle"));
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [name, current]);
  return availability;
}

export const usernameHint = (name: string, availability: Availability) =>
  availability === "taken" ? "That username is already taken."
  : availability === "available" ? `Available · your profile will be /u/${name}`
  : availability === "checking" ? "Checking…"
  : `Your profile will be /u/${name || "…"}`;

const styles = StyleSheet.create({
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  bannerButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  camera: { position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
