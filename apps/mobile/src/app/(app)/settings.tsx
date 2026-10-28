import { useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { router } from "expo-router";
import useSWR, { useSWRConfig } from "swr";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Download, FileUp } from "lucide-react-native";
import { GENRES } from "@bookmark/shared/genres";
import { preferencesOf, type CommunityPreferences } from "@bookmark/shared/preferences";
import { privacyOf, type PrivacySettings } from "@bookmark/shared/privacyRules";
import { PUSH_GROUP_LABELS, type PushGroup } from "@bookmark/shared/push";
import { can, roleOf } from "@bookmark/shared/roles";
import { INVITE_HINT, INVITE_OPTIONS, LIST_OPTIONS, PROFILE_HINT, PROFILE_OPTIONS, REVIEW_OPTIONS } from "@bookmark/shared/settingsCopy";
import { FollowRequests } from "@/components/library/FollowRequests";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Text } from "@/components/ui/Text";
import { ApiError, api, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SENTRY_DSN, sendTestError } from "@/lib/sentry";
import { useTheme, useThemePreference, type ThemePreference } from "@/lib/theme";

// Settings (the web's /settings): appearance, favourite genres, privacy, community, AI, push notifications, your data and
// deleting the account. Every control saves as soon as it changes.

type Settings = PrivacySettings & CommunityPreferences & { favGenres: string[]; hideShelfPicks: boolean };
type SettingsUser = Partial<Settings> & { id: string; username: string | null; role?: string | null; isStaff?: boolean | null };
type PlanResponse = { status: { plan: "FREE" | "PLUS"; store: "APP_STORE" | "PLAY_STORE" | null; source: string | null } | null };

const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match device" },
];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { data: user, mutate } = useSWR<SettingsUser>("/api/user");
  const { mutate: mutateAll } = useSWRConfig();
  const [pending, setPending] = useState<keyof Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  const settings: Settings = { ...privacyOf(user), ...preferencesOf(user), favGenres: user.favGenres ?? [], hideShelfPicks: user.hideShelfPicks ?? false };
  const busy = pending !== null;

  // Optimistic: the control moves straight away and rolls back if the save fails.
  const save = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setPending(key);
    setError(null);
    void mutate({ ...user, [key]: value }, { revalidate: false });
    try {
      const saved = await api.patch<Partial<Settings>>("/api/user/privacy", { [key]: value });
      void mutate({ ...user, ...saved }, { revalidate: false });
      // Your own profile payload (counts, reviews) depends on these.
      void mutateAll((k) => typeof k === "string" && k.startsWith("/api/users/") && !k.includes("/search"));
      // Discover's genre order and the genre picks follow these.
      if (key === "favGenres") { void mutateAll("/api/discover"); void mutateAll("/api/discover/for-you"); }
    } catch {
      void mutate(user, { revalidate: false });
      setError("Couldn't save that setting. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen edges={["left", "right"]}>
      <View style={{ gap: 6 }}>
        <Text variant="display">Settings</Text>
        <Text variant="muted">Changes here save as soon as you make them.</Text>
      </View>
      {error && <Notice tone="error" message={error} />}

      <Card title="Profile">
        <Text variant="muted">Your display name, username, photo, colour and banner.</Text>
        <Button title="Edit profile" variant="outline" onPress={() => router.push("/profile/edit")} />
      </Card>

      <Card title="Appearance">
        <Segmented options={APPEARANCE} value={preference} onChange={setPreference} />
      </Card>

      <Card title="Your genres" hint="They come first on Discover, and decide which books we suggest to you.">
        <View style={styles.chips}>
          {GENRES.map((genre) => {
            const on = settings.favGenres.includes(genre.slug);
            return (
              <Chip
                key={genre.slug}
                label={genre.label}
                selected={on}
                disabled={busy}
                onPress={() => void save("favGenres", on ? settings.favGenres.filter((g) => g !== genre.slug) : [...settings.favGenres, genre.slug])}
              />
            );
          })}
        </View>
        <Toggle label="Suggest books on my shelf" hint="Popular books from your genres, at the top of your shelf until it holds a few books." value={!settings.hideShelfPicks} onChange={(v) => void save("hideShelfPicks", !v)} disabled={busy} />
      </Card>

      <Card title="Plus">
        <Text variant="muted">Your plan, this month's AI allowances, and Bookmark Plus.</Text>
        <Button title="Plan and billing" variant="outline" onPress={() => router.push("/plus" as never)} />
      </Card>

      <FollowRequests />

      <Card title="Privacy" hint="Blocked readers never see your profile, whatever you choose here.">
        <View style={{ gap: 6 }}>
          <Segmented label="Who can see your profile" options={PROFILE_OPTIONS} value={settings.profileVisibility} onChange={(v) => void save("profileVisibility", v)} disabled={busy} />
          <Text variant="small">{PROFILE_HINT[settings.profileVisibility]}</Text>
        </View>
        <Segmented label="Who can read your reviews" options={REVIEW_OPTIONS} value={settings.reviewVisibility} onChange={(v) => void save("reviewVisibility", v)} disabled={busy} />
        <Toggle label="Hide my Want to read shelf" hint="Others won't see what's on your list, or when you add to it." value={settings.hideWantToRead} onChange={(v) => void save("hideWantToRead", v)} disabled={busy} />
        <Toggle label="Keep Did not finish to myself" hint="Nobody else sees that shelf anyway. This also keeps “stopped reading” out of your followers' feeds." value={settings.hideDidNotFinish} onChange={(v) => void save("hideDidNotFinish", v)} disabled={busy} />
        <Toggle label="Hide follower and following counts" hint="No numbers on your profile, for you or anyone else, and your connection lists stay private." value={settings.hideFollowCounts} onChange={(v) => void save("hideFollowCounts", v)} disabled={busy} />
        {/* The team's badge always shows, so only librarians get the choice. */}
        {roleOf(user) === "LIBRARIAN" && (
          <Toggle label="Hide my Librarian badge" hint="Your profile, reviews, comments, lists and notifications won't show that you're a librarian. Your librarian tools stay the same." value={settings.hideStaffBadge} onChange={(v) => void save("hideStaffBadge", v)} disabled={busy} />
        )}
      </Card>

      <Card title="Community">
        <View style={{ gap: 6 }}>
          <Segmented label="Who can invite you to reading circles" options={INVITE_OPTIONS} value={settings.buddyReadInvites} onChange={(v) => void save("buddyReadInvites", v)} disabled={busy} />
          <Text variant="small">{INVITE_HINT[settings.buddyReadInvites]} An invite link always works.</Text>
        </View>
        <Segmented label="New lists start as" options={LIST_OPTIONS} value={settings.defaultListVisibility} onChange={(v) => void save("defaultListVisibility", v)} disabled={busy} />
        <Toggle label="Show spoilers in reviews" hint="Reviews marked as spoilers open straight away instead of staying covered." value={settings.showSpoilers} onChange={(v) => void save("showSpoilers", v)} disabled={busy} />
      </Card>

      <Card title="AI features" hint="Only ever for something you ask for, always labelled, and never about you.">
        <Toggle
          label="Use AI features"
          hint="Ask the shelf, which finds books from a description in your own words, and Catch me up, a short recap of the story so far when you come back to a book (with Plus). Recaps are only for you. Off to start on a free account and on with Plus; switch it off any time."
          value={settings.aiFeatures}
          onChange={(v) => void save("aiFeatures", v)}
          disabled={busy}
        />
      </Card>

      <PushSettings />
      <DataExport />
      {can(user, "staff.log") && <MonitoringTest />}
      <DeleteAccount username={user.username} />
    </Screen>
  );
}

// Admins only: checks a new build reports errors (BOO-54, docs/ops/error-monitoring.md).
function MonitoringTest() {
  const [sent, setSent] = useState(false);
  return (
    <Card title="Error monitoring" hint={SENTRY_DSN ? "Sends one test error from this phone to Sentry." : "Off in this build: EXPO_PUBLIC_SENTRY_DSN isn't set."}>
      <Button title="Send a test error" variant="outline" disabled={!SENTRY_DSN} onPress={() => { sendTestError(); setSent(true); }} />
      {sent && <Text variant="small">Sent. Look for it in Sentry in a minute or so.</Text>}
    </Card>
  );
}

function Card({ title, hint, children, danger }: { title: string; hint?: string; children: ReactNode; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: danger ? colors.danger : colors.border }]}>
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">{title}</Text>
        {hint ? <Text variant="small">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        <Text variant="small">{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.foreground, false: colors.input }}
        thumbColor={colors.background}
      />
    </View>
  );
}

// Which pushes arrive (GET/PATCH /api/push/settings). The bell keeps every notification either way.
function PushSettings() {
  const { data, mutate } = useSWR<{ push: Record<PushGroup, boolean> }>("/api/push/settings");
  const [failed, setFailed] = useState(false);
  if (!data) return null;

  const set = async (group: PushGroup, on: boolean) => {
    setFailed(false);
    void mutate({ push: { ...data.push, [group]: on } }, { revalidate: false });
    try {
      await mutate(api.patch<{ push: Record<PushGroup, boolean> }>("/api/push/settings", { push: { [group]: on } }), { revalidate: false });
    } catch {
      void mutate(data, { revalidate: false });
      setFailed(true);
    }
  };

  return (
    <Card title="Notifications" hint="Choose what arrives as a push. Everything still shows under the bell.">
      {failed && <Notice tone="error" message="Couldn't save that setting. Try again." />}
      {(Object.keys(PUSH_GROUP_LABELS) as PushGroup[]).map((group) => (
        <Toggle key={group} label={PUSH_GROUP_LABELS[group].title} hint={PUSH_GROUP_LABELS[group].description} value={data.push[group]} onChange={(v) => void set(group, v)} />
      ))}
    </Card>
  );
}

type Format = "json" | "csv";
const filenameFrom = (header: string | null, fallback: string) => header?.match(/filename="?([^";]+)"?/)?.[1] ?? fallback;

// Fetches the export, saves it and opens the share sheet, so it can go to Files, Drive or an email.
function DataExport() {
  const { colors } = useTheme();
  const [pending, setPending] = useState<Format | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const download = async (format: Format) => {
    setPending(format);
    setFailed(null);
    try {
      const res = await apiFetch(`/api/export?format=${format}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Couldn't export your data. Try again.");
      }
      const name = filenameFrom(res.headers.get("Content-Disposition"), `bookmark-export.${format}`);
      const mimeType = format === "json" ? "application/json" : "text/csv";
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(await res.text());
      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: "Save your Bookmark data", UTI: format === "json" ? "public.json" : "public.comma-separated-values-text" });
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Couldn't export your data. Try again.");
    } finally {
      setPending(null);
    }
  };

  const icon = <Download size={16} color={colors.foreground} />;
  return (
    <Card title="Your data" hint="Your data is yours: take it anywhere, anytime.">
      {failed && <Notice tone="error" message={failed} />}
      <Button title="Download my data (JSON)" variant="outline" icon={icon} loading={pending === "json"} disabled={pending !== null} onPress={() => void download("json")} />
      <Button title="Export books (CSV)" variant="outline" icon={icon} loading={pending === "csv"} disabled={pending !== null} onPress={() => void download("csv")} />
      <Button title="Import from Goodreads or StoryGraph" variant="outline" icon={<FileUp size={16} color={colors.foreground} />} onPress={() => router.push("/import")} />
      <Text variant="small">The CSV uses Goodreads' columns, so apps that import from Goodreads can read it.</Text>
    </Card>
  );
}

const STORE_NAME = { APP_STORE: "the App Store", PLAY_STORE: "Google Play" } as const;
const STORE_SUBSCRIPTIONS = {
  APP_STORE: "https://apps.apple.com/account/subscriptions",
  PLAY_STORE: "https://play.google.com/store/account/subscriptions",
} as const;

// Deleting needs the username typed back, so it can't happen from one stray tap. A subscription from
// the App Store or Google Play can only be cancelled there, so the reader is told before anything goes.
function DeleteAccount({ username }: { username: string | null }) {
  const { colors, radii, fonts } = useTheme();
  const signOut = useAuth((s) => s.signOut);
  const { data: plan } = useSWR<PlanResponse>("/api/plus/status");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (!username) return null;
  const store = plan?.status?.store ?? null;

  const handleDelete = async () => {
    setDeleting(true);
    setFailed(null);
    try {
      await api.delete("/api/user");
      await signOut();
    } catch (err) {
      setFailed(err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  };

  return (
    <Card title="Delete account" danger>
      {!confirming ? (
        <>
          <Text variant="muted">Permanently remove your account, books, notes, goals and followers.</Text>
          <Button title="Delete account" variant="outline" onPress={() => setConfirming(true)} />
        </>
      ) : (
        <>
          <Text variant="label">Delete your account for good?</Text>
          {store && (
            <View style={[styles.storeNote, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text variant="label">Cancel Plus in {STORE_NAME[store]} first</Text>
              <Text variant="muted">
                Your Plus subscription is billed by {STORE_NAME[store]}, and deleting your account doesn't stop it. Cancel it there so you aren't charged again.
              </Text>
              <Button title={`Open ${STORE_NAME[store]} subscriptions`} variant="outline" onPress={() => void Linking.openURL(STORE_SUBSCRIPTIONS[store])} />
            </View>
          )}
          <Text variant="muted">
            This can't be undone. Your shelf, notes, lists and the rest of your account go with it. Comments you posted in reading circles stay, shown as a former member's, and circles you host pass to the reader who's been in them longest. Type <Text variant="label">{username}</Text> to confirm.
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            editable={!deleting}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Type your username to confirm"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { borderRadius: radii.md, borderColor: colors.input, color: colors.foreground, fontFamily: fonts.sans }]}
          />
          {failed && <Notice tone="error" message={failed} />}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: deleting || typed !== username }}
            disabled={deleting || typed !== username}
            onPress={() => void handleDelete()}
            style={[styles.danger, { borderRadius: radii.md, backgroundColor: colors.danger, opacity: deleting || typed !== username ? 0.5 : 1 }]}
          >
            <Text variant="label" style={{ color: "#ffffff" }}>{deleting ? "Deleting…" : "Delete my account"}</Text>
          </Pressable>
          <Button title="Keep my account" variant="outline" disabled={deleting} onPress={() => { setConfirming(false); setTyped(""); }} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 16 },
  storeNote: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  input: { borderWidth: 1, height: 44, paddingHorizontal: 12, fontSize: 16 },
  danger: { height: 48, alignItems: "center", justifyContent: "center" },
});
