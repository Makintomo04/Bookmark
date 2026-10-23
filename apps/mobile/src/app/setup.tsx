import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import useSWR from "swr";
import { BookOpen, Check, ChevronRight, Target, Upload, UsersRound } from "lucide-react-native";
import { BANNER_PRESETS, bannerPresetValue, defaultBannerPreset, type BannerPresetId } from "@bookmark/shared/banners";
import { GENRES } from "@bookmark/shared/genres";
import { GOAL_BOOKS_MAX } from "@bookmark/shared/goals";
import { DEFAULT_COLOUR, SWATCHES, normaliseUsername, suggestUsername, usernameProblem } from "@bookmark/shared/profile";
import { PROFILE_HINT, PROFILE_OPTIONS } from "@bookmark/shared/settingsCopy";
import type { ProfileVisibility } from "@bookmark/shared/enums";
import { Avatar } from "@/components/profile/Avatar";
import { BannerPattern } from "@/components/profile/BannerPattern";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";

// Onboarding, after the web's /new-user: 1. username, colour and banner; 2. favourite genres and who can
// see the profile; 3. ways to start (a reading circle first, as on the landing page), and a yearly goal.
// Saving step 1 finishes onboarding on the server, but the app only moves on to the tabs when the reader
// leaves step 3 (refreshUser), so steps 2 and 3 aren't skipped.

type Step = 1 | 2 | 3;
type Availability = "idle" | "checking" | "available" | "taken";
type Me = { id: string; name: string | null; email: string | null; image: string | null };
type Settings = { favGenres: string[]; profileVisibility: ProfileVisibility };

const GOAL_PRESETS = [12, 24, 52];

export default function Setup() {
  const [step, setStep] = useState<Step>(1);
  const { data: me } = useSWR<Me>("/api/user");

  return (
    <Screen>
      <View style={styles.header}>
        <Logo size={36} />
        <Progress step={step} />
      </View>
      {!me ? (
        <ActivityIndicator />
      ) : step === 1 ? (
        <ProfileStep me={me} onDone={() => setStep(2)} />
      ) : step === 2 ? (
        <CommunityStep onDone={() => setStep(3)} />
      ) : (
        <StartStep />
      )}
    </Screen>
  );
}

function Progress({ step }: { step: Step }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6, alignSelf: "stretch" }} accessibilityLabel={`Step ${step} of 3`}>
      <View style={styles.bars}>
        {[1, 2, 3].map((n) => <View key={n} style={[styles.bar, { backgroundColor: n <= step ? colors.brand : colors.muted }]} />)}
      </View>
      <Text variant="small">Step {step} of 3</Text>
    </View>
  );
}

// ---- 1. Profile -------------------------------------------------------------------------------

function ProfileStep({ me, onDone }: { me: Me; onDone: () => void }) {
  const { colors, radii } = useTheme();
  const [username, setUsername] = useState(() => suggestUsername(me));
  const [colour, setColour] = useState(DEFAULT_COLOUR);
  const [banner, setBanner] = useState<BannerPresetId>(() => defaultBannerPreset(me.id));
  const [availability, setAvailability] = useState<Availability>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = normaliseUsername(username);
  const problem = name ? usernameProblem(name) : null;

  // Debounced, and ignores answers about a name the reader has since typed past.
  useEffect(() => {
    if (usernameProblem(name)) return setAvailability("idle");
    setAvailability("checking");
    let current = true;
    const timer = setTimeout(() => {
      api.get<{ available: boolean }>(`/api/new-user?username=${encodeURIComponent(name)}`)
        .then((res) => current && setAvailability(res.available ? "available" : "taken"))
        .catch(() => current && setAvailability("idle"));
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [name]);

  const save = async () => {
    if (problem) return setError(problem);
    if (availability === "taken") return setError("That username is already taken.");
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/new-user", { username: name, color: colour, imageSrc: me.image || undefined, bannerSrc: bannerPresetValue(banner) });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your profile. Check your connection and try again.");
      setSaving(false);
    }
  };

  const hint = availability === "taken" ? "That username is already taken."
    : availability === "available" ? `Available · your profile will be /u/${name}`
    : availability === "checking" ? "Checking…"
    : `Your profile will be /u/${name || "…"}`;

  return (
    <View style={styles.step}>
      <View style={styles.intro}>
        <Text variant="display" style={styles.center}>Set up your profile</Text>
        <Text variant="muted" style={styles.center}>This is how other readers see you. You can change it any time.</Text>
      </View>

      <View style={[styles.preview, { borderRadius: radii.lg }]}>
        <BannerPattern preset={banner} colour={colour} />
        <View style={styles.previewAvatar}>
          <Avatar image={me.image} name={name} colour={colour} size={64} ring />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} error={error ?? problem} />
        {!error && !problem && <Text variant="small" style={availability === "taken" && { color: colors.danger }}>{hint}</Text>}
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="label">Your colour</Text>
        <View accessibilityRole="radiogroup" style={styles.swatches}>
          {SWATCHES.map((swatch) => (
            <Pressable
              key={swatch}
              accessibilityRole="radio"
              accessibilityLabel={swatch}
              accessibilityState={{ checked: colour === swatch }}
              onPress={() => setColour(swatch)}
              style={[styles.swatch, { backgroundColor: swatch, borderColor: colour === swatch ? colors.foreground : "transparent" }]}
            >
              {colour === swatch && <Check size={16} color="#ffffff" />}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="label">Your banner</Text>
        <View accessibilityRole="radiogroup" style={styles.banners}>
          {BANNER_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              accessibilityRole="radio"
              accessibilityLabel={preset.name}
              accessibilityState={{ checked: banner === preset.id }}
              onPress={() => setBanner(preset.id)}
              style={[styles.bannerOption, { borderRadius: radii.md, borderColor: banner === preset.id ? colors.foreground : colors.border }]}
            >
              <BannerPattern preset={preset.id} colour={colour} />
            </Pressable>
          ))}
        </View>
      </View>

      <Button title={saving ? "Saving…" : "Continue"} loading={saving} disabled={availability === "checking"} onPress={save} />
    </View>
  );
}

// ---- 2. Community -----------------------------------------------------------------------------

function CommunityStep({ onDone }: { onDone: () => void }) {
  const { data } = useSWR<Settings>("/api/user/privacy");
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (data && !draft) setDraft({ favGenres: data.favGenres, profileVisibility: data.profileVisibility }); }, [data, draft]);
  if (!draft) return <ActivityIndicator />;

  const toggle = (slug: string) =>
    setDraft({ ...draft, favGenres: draft.favGenres.includes(slug) ? draft.favGenres.filter((g) => g !== slug) : [...draft.favGenres, slug] });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch("/api/user/privacy", draft);
      onDone();
    } catch {
      setError("Couldn't save your choices. Try again, or skip for now.");
      setSaving(false);
    }
  };

  return (
    <View style={styles.step}>
      <View style={styles.intro}>
        <Text variant="display" style={styles.center}>What do you like to read?</Text>
        <Text variant="muted" style={styles.center}>We{"’"}ll use this to suggest books and readers. Everything else starts on sensible defaults you can change in Settings.</Text>
      </View>
      {error && <Notice tone="error" message={error} />}
      <View style={{ gap: 8 }}>
        <Text variant="label">Genres you love</Text>
        <Text variant="small">Pick as many as you like.</Text>
        <View style={styles.chips}>
          {GENRES.map((genre) => <Chip key={genre.slug} label={genre.label} selected={draft.favGenres.includes(genre.slug)} disabled={saving} onPress={() => toggle(genre.slug)} />)}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Segmented label="Who can see your profile" options={PROFILE_OPTIONS} value={draft.profileVisibility} onChange={(v) => setDraft({ ...draft, profileVisibility: v })} disabled={saving} />
        <Text variant="small">{PROFILE_HINT[draft.profileVisibility]}</Text>
      </View>
      <Button title={saving ? "Saving…" : "Continue"} loading={saving} onPress={save} />
      <Button title="Skip" variant="outline" disabled={saving} onPress={onDone} />
    </View>
  );
}

// ---- 3. Ways to start -------------------------------------------------------------------------

function StartStep() {
  const refreshUser = useAuth((s) => s.refreshUser);
  const setPendingPath = useAuth((s) => s.setPendingPath);
  const username = useAuth((s) => s.user?.username);
  const { data: me } = useSWR<{ username: string | null }>("/api/user");
  const [leaving, setLeaving] = useState(false);

  // Onboarding is done: the root layout moves on to the app, which then opens where the reader chose.
  const finish = async (path?: string) => {
    setLeaving(true);
    setPendingPath(path ?? null);
    await refreshUser().catch(() => {});
  };

  return (
    <View style={styles.step}>
      <View style={styles.intro}>
        <Text variant="display" style={styles.center}>Welcome, {me?.username ?? username}</Text>
        <Text variant="muted" style={styles.center}>Your profile is ready. Start a circle with friends, or put a few books on your shelf.</Text>
      </View>
      <Option icon={UsersRound} title="Start a reading circle" description="Pick a book, share one link, and talk about it as you go." onPress={() => finish("/add-book?shelf=STARTED&startCircle=1")} />
      <Option icon={BookOpen} title="Add the book you're reading" description="Search by title or author." onPress={() => finish("/add-book?shelf=STARTED")} />
      <Option icon={Upload} title="Import from Goodreads or StoryGraph" description="Bring your shelves, ratings and dates in about a minute." onPress={() => WebBrowser.openBrowserAsync(webUrl("/import"))} />
      <GoalOption />
      <Button title="Go to my library" variant="outline" loading={leaving} onPress={() => finish()} />
    </View>
  );
}

function Option({ icon: Icon, title, description, onPress }: { icon: typeof BookOpen; title: string; description: string; onPress: () => void }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, { borderRadius: radii.lg, borderColor: pressed ? colors.brand : colors.border }]}>
      <IconBadge><Icon size={20} color={colors.brandText} /></IconBadge>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16 }}>{title}</Text>
        <Text variant="muted">{description}</Text>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.badge, { backgroundColor: colors.muted }]}>{children}</View>;
}

// Sets this year's goal in place.
function GoalOption() {
  const { colors, radii } = useTheme();
  const year = new Date().getFullYear();
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const customRef = useRef(custom);
  customRef.current = custom;

  const save = async (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > GOAL_BOOKS_MAX) return setError(`Pick a goal between 1 and ${GOAL_BOOKS_MAX} books.`);
    setError(null);
    setSaving(value);
    try {
      await api.post("/api/reading-goal", { year, targetBooks: value });
      setSaved(value);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your goal. Try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[styles.option, { borderRadius: radii.lg, borderColor: colors.border, flexDirection: "column", alignItems: "stretch" }]}>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <IconBadge><Target size={20} color={colors.brandText} /></IconBadge>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16 }}>Set a {year} reading goal</Text>
          <Text variant="muted" accessibilityLiveRegion="polite">{saved ? `${saved} books this year. Change it any time.` : "How many books this year?"}</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {GOAL_PRESETS.map((n) => <Chip key={n} label={saving === n ? "…" : String(n)} selected={saved === n} disabled={saving !== null} onPress={() => save(n)} />)}
        <View style={{ width: 110 }}>
          <TextField label="Other" value={custom} onChangeText={setCustom} keyboardType="number-pad" returnKeyType="done" onSubmitEditing={() => save(parseInt(customRef.current, 10))} style={{ minHeight: 36 }} />
        </View>
      </View>
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", gap: 16 },
  bars: { flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  step: { gap: 20 },
  intro: { gap: 8 },
  center: { textAlign: "center" },
  preview: { height: 120, overflow: "hidden", justifyContent: "flex-end" },
  previewAvatar: { padding: 12 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  banners: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bannerOption: { width: "31%", flexGrow: 1, height: 56, overflow: "hidden", borderWidth: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end" },
  option: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: 1 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
