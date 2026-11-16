import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import useSWR from "swr";
import { BookOpen, ChevronRight, Compass, Target, Upload, UsersRound } from "lucide-react-native";
import { bannerTint } from "@bookmark/shared/banners";
import { GENRES } from "@bookmark/shared/genres";
import { GOAL_BOOKS_MAX } from "@bookmark/shared/goals";
import { DEFAULT_COLOUR, DISPLAY_NAME_MAX, displayNameProblem, normaliseDisplayName, normaliseUsername, readerName, suggestUsername, usernameProblem } from "@bookmark/shared/profile";
import { PROFILE_HINT, PROFILE_OPTIONS } from "@bookmark/shared/settingsCopy";
import type { ProfileVisibility } from "@bookmark/shared/enums";
import { ColourPicker, PhotoPicker, usernameHint, useUsernameAvailability } from "@/components/profile/ProfileFields";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { cardStyle } from "@/components/ui/Section";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

// Onboarding, after the web's /new-user: 1. username, picture and colour; 2. favourite genres and who can
// see the profile; 3. ways to start (a reading circle first, as on the landing page, then the first-book
// picker for a reader who doesn't know what to read yet), and a yearly goal.
// Saving step 1 finishes onboarding on the server, but the app only moves on to the tabs when the reader
// leaves step 3 (refreshUser), so steps 2 and 3 aren't skipped.

type Step = 1 | 2 | 3;
type Me = { id: string; name: string | null; email: string | null; image: string | null };
type Settings = { favGenres: string[]; profileVisibility: ProfileVisibility };

const GOAL_PRESETS = [12, 24, 52];

export default function Setup() {
  const [step, setStep] = useState<Step>(1);
  const { data: me } = useSWR<Me>("/api/user");

  return (
    <Screen>
      <Progress step={step} />
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
        {[1, 2, 3].map((n) => <View key={n} style={[styles.bar, { backgroundColor: n <= step ? colors.brandFill : colors.muted }]} />)}
      </View>
      <Text variant="small">Step {step} of 3</Text>
    </View>
  );
}

// ---- 1. Profile -------------------------------------------------------------------------------

function ProfileStep({ me, onDone }: { me: Me; onDone: () => void }) {
  const { colors, radii, fonts } = useTheme();
  const [username, setUsername] = useState(() => suggestUsername(me));
  const [displayName, setDisplayName] = useState("");
  const [colour, setColour] = useState(DEFAULT_COLOUR);
  // Google and Apple accounts may arrive with a picture; start from it.
  const [image, setImage] = useState<string | null>(me.image || null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = normaliseUsername(username);
  const problem = name ? usernameProblem(name) : null;
  const availability = useUsernameAvailability(username);
  const displayNameError = displayNameProblem(normaliseDisplayName(displayName));

  const save = async () => {
    if (problem) return setError(problem);
    if (availability === "taken") return setError("That username is already taken.");
    if (displayNameError) return setError(displayNameError);
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/new-user", { username: name, displayName: normaliseDisplayName(displayName) || undefined, color: colour, imageSrc: image || undefined });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your profile. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <View style={styles.step}>
      <View style={styles.intro}>
        <Text variant="display" accessibilityRole="header">Set up your profile</Text>
        <Text variant="muted">This is how other readers see you. You can change it any time.</Text>
      </View>

      {/* A live preview of the top of their profile: the strip every profile has until they upload a banner
          (BOO-99), the picture over it, and the name it will go by. */}
      <View style={[cardStyle(colors, radii.lg), { overflow: "hidden" }]}>
        <View style={[styles.preview, { backgroundColor: bannerTint(colour, colors.popover) }]} />
        <View style={styles.previewBody}>
          <View style={styles.previewPhoto}><PhotoPicker compact image={image} name={name} colour={colour} onChange={setImage} /></View>
          <View style={{ gap: 2 }}>
            {image && (
              <Pressable accessibilityRole="button" onPress={() => setImage(null)} hitSlop={8} style={styles.removePhoto}>
                <Text variant="muted">Remove photo</Text>
              </Pressable>
            )}
            <Text numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 26 }}>{normaliseDisplayName(displayName) || name || "Your name"}</Text>
            <Text variant="muted" numberOfLines={1}>@{name || "username"}</Text>
          </View>
        </View>
      </View>

      <TextField
        label="Username"
        prefix="@"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        error={error ?? problem}
        hint={usernameHint(name, availability)}
        hintTone={availability === "taken" ? "danger" : availability === "available" ? "good" : "muted"}
      />
      <TextField
        label="Display name"
        labelNote="optional"
        placeholder="How should readers know you?"
        value={displayName}
        onChangeText={(t) => setDisplayName(t.slice(0, DISPLAY_NAME_MAX))}
        autoCapitalize="words"
        error={displayNameError}
        hint="Heads your profile, with your username under it. Leave it blank to go by your username."
      />

      <ColourPicker value={colour} onChange={setColour} />

      <View style={styles.foot}>
        <Button title={saving ? "Saving…" : "Continue"} loading={saving} disabled={availability === "checking"} onPress={save} />
      </View>
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
        <Text variant="display" accessibilityRole="header">What do you like to read?</Text>
        <Text variant="muted">We{"’"}ll use this to suggest books to start your shelf. Everything else starts on sensible defaults you can change in Settings.</Text>
      </View>
      {error && <Notice tone="error" message={error} />}
      <View style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text variant="title">Genres you love</Text>
          <Text variant="muted">Pick as many as you like.</Text>
        </View>
        <View style={styles.chips}>
          {GENRES.map((genre) => <Chip key={genre.slug} label={genre.label} selected={draft.favGenres.includes(genre.slug)} disabled={saving} onPress={() => toggle(genre.slug)} />)}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Segmented label="Who can see your profile" options={PROFILE_OPTIONS} value={draft.profileVisibility} onChange={(v) => setDraft({ ...draft, profileVisibility: v })} disabled={saving} />
        <Text variant="small">{PROFILE_HINT[draft.profileVisibility]}</Text>
      </View>
      <View style={styles.foot}>
        <Button title={saving ? "Saving…" : "Continue"} loading={saving} onPress={save} />
        <Pressable accessibilityRole="button" disabled={saving} onPress={onDone} hitSlop={8} style={styles.skip}>
          <Text variant="muted">Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---- 3. Ways to start -------------------------------------------------------------------------

function StartStep() {
  const refreshUser = useAuth((s) => s.refreshUser);
  const setPendingPath = useAuth((s) => s.setPendingPath);
  const username = useAuth((s) => s.user?.username);
  const { data: me } = useSWR<{ username: string | null; displayName?: string | null }>("/api/user");
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
        <Text variant="display" accessibilityRole="header">Welcome, {me ? readerName(me) : username}</Text>
        <Text variant="muted">Your profile is ready. Here are a few ways to start.</Text>
      </View>
      <Option recommended icon={UsersRound} title="Start a reading circle" description="Read one book with friends: pick it, share one link, and talk about it as you go." onPress={() => finish("/add-book?shelf=STARTED&startCircle=1")} />
      <Option icon={Compass} title="Help me pick my first book" description="Popular books in the genres you picked, and what the Bookmark team and people you follow recommend." onPress={() => finish("/first-book")} />
      <Option icon={BookOpen} title="Add the book you're reading" description="Search by title or author." onPress={() => finish("/add-book?shelf=STARTED")} />
      <Option icon={Upload} title="Import from Goodreads or StoryGraph" description="Bring your shelves, ratings and dates in about a minute." onPress={() => finish("/import")} />
      <GoalOption />
      <View style={styles.foot}>
        <Button title="Go to my library" variant="outline" loading={leaving} onPress={() => finish()} />
      </View>
    </View>
  );
}

// `recommended` is the first way in, as on the landing page: a reading circle, marked with the brand's edge.
function Option({ icon: Icon, title, description, onPress, recommended }: { icon: typeof BookOpen; title: string; description: string; onPress: () => void; recommended?: boolean }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recommended ? `${title}, recommended` : title}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [styles.option, cardStyle(colors, radii.lg, pressed, colors.muted), recommended && { borderColor: `${colors.brandFill}99` }]}
    >
      <IconBadge><Icon size={20} strokeWidth={1.75} color={recommended ? colors.brandText : colors.foreground} /></IconBadge>
      <View style={{ flex: 1, gap: 2 }}>
        {recommended && <Text variant="small" style={{ color: colors.brandText }}>Recommended</Text>}
        <Text variant="title" style={{ fontSize: 16, lineHeight: 22 }}>{title}</Text>
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
      // askReminders is ignored here on purpose, as on the web's sign-up: the reader has enough to take in
      // already, and reminders are offered on their third reading day or when they next set a goal (BOO-48).
      await api.post("/api/reading-goal", { year, targetBooks: value });
      setSaved(value);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your goal. Try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[styles.option, cardStyle(colors, radii.lg), { flexDirection: "column", alignItems: "stretch" }]}>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <IconBadge><Target size={20} strokeWidth={1.75} color={colors.foreground} /></IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" style={{ fontSize: 16, lineHeight: 22 }}>Set a {year} reading goal</Text>
          <Text variant="muted" accessibilityLiveRegion="polite">{saved ? `${saved} books this year. Change it any time.` : "How many books this year?"}</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {GOAL_PRESETS.map((n) => <Chip key={n} label={saving === n ? "…" : String(n)} selected={saved === n} disabled={saving !== null} onPress={() => save(n)} />)}
        <View style={{ width: 110 }}>
          <TextField label="Other" value={custom} onChangeText={setCustom} keyboardType="number-pad" returnKeyType="done" selectTextOnFocus onSubmitEditing={() => save(parseInt(customRef.current, 10))} style={{ minHeight: 36 }} />
        </View>
        {/* A number pad on iOS has no return key, so Other has its own button. */}
        {custom.trim() !== "" && <Button title="Save" variant="outline" loading={saving === parseInt(custom, 10)} disabled={saving !== null} onPress={() => save(parseInt(customRef.current, 10))} />}
      </View>
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { height: 72 },
  previewBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  // The picture rises into the banner, as on a profile.
  previewPhoto: { marginTop: -36 },
  removePhoto: { position: "absolute", right: 0, top: -30 },
  bars: { flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  step: { flexGrow: 1, gap: 20 },
  intro: { gap: 6 },
  // The step's way on, at the foot of the screen when the step is short.
  foot: { marginTop: "auto", paddingTop: 8, gap: 8 },
  skip: { alignSelf: "center", paddingVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end" },
  option: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
