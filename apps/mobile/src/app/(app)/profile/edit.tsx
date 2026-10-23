import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import useSWR, { mutate } from "swr";
import { Image } from "expo-image";
import { bannerPresetOf, bannerPresetValue, resolveBanner, type BannerPresetId } from "@bookmark/shared/banners";
import { BIO_MAX, DEFAULT_COLOUR, normaliseUsername, usernameProblem } from "@bookmark/shared/profile";
import { BannerPattern } from "@/components/profile/BannerPattern";
import { BannerPicker, ColourPicker, PhotoPicker, usernameHint, useUsernameAvailability } from "@/components/profile/ProfileFields";
import type { ProfileUser } from "@/components/profile/ProfileHeader";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { goBack } from "@/lib/navigation";
import { useTheme } from "@/lib/theme";

// Edit profile (the web's EditProfileModal): picture, username, bio, colour and banner. A banner photo
// uploaded on the web is kept unless a pattern is chosen here.
export default function EditProfile() {
  const { colors } = useTheme();
  const { data: user } = useSWR<ProfileUser>("/api/user");
  if (!user) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  return <ProfileForm user={user} />;
}

function ProfileForm({ user }: { user: ProfileUser }) {
  const { colors, radii } = useTheme();
  const refreshUser = useAuth((s) => s.refreshUser);
  const [username, setUsername] = useState(user.username ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [colour, setColour] = useState(user.favColour || DEFAULT_COLOUR);
  const [image, setImage] = useState<string | null>(user.image || null);
  const savedBanner = resolveBanner(user.banner, user.id);
  const [banner, setBanner] = useState<string>(savedBanner);
  const preset = bannerPresetOf(banner);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = normaliseUsername(username);
  const problem = name ? usernameProblem(name) : "Choose a username.";
  const availability = useUsernameAvailability(username, user.username);

  const save = async () => {
    if (problem && name !== user.username?.toLowerCase()) return setError(problem);
    if (availability === "taken") return setError("That username is already taken.");
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/user", { username: name, bio, color: colour, imageSrc: image, bannerSrc: banner });
      await mutate("/api/user");
      await refreshUser();
      goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your profile. Try again.");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={[styles.banner, { borderRadius: radii.lg }]}>
        {preset ? <BannerPattern preset={preset} colour={colour} /> : <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      </View>
      <PhotoPicker image={image} name={name} colour={colour} onChange={setImage} />
      {error && <Notice tone="error" message={error} />}
      <View style={{ gap: 6 }}>
        <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        <Text variant="small" style={availability === "taken" && { color: colors.danger }}>{usernameHint(name, availability)}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <TextField label="Bio · optional" value={bio} onChangeText={(t) => setBio(t.slice(0, BIO_MAX))} multiline textAlignVertical="top" style={{ minHeight: 90, paddingTop: 12 }} />
        <Text variant="small">{bio.length} / {BIO_MAX}</Text>
      </View>
      <ColourPicker value={colour} onChange={setColour} />
      <BannerPicker value={preset as BannerPresetId | null} colour={colour} onChange={(id) => setBanner(bannerPresetValue(id))} />
      <Button title="Save" loading={saving} disabled={availability === "checking"} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { height: 96, overflow: "hidden" },
});
