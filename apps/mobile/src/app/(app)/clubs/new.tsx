import { useState } from "react";
import { router } from "expo-router";
import useSWR, { useSWRConfig } from "swr";
import { CLUB_ABOUT_MAX, CLUB_MAX_MEMBERS, CLUB_NAME_MAX } from "@bookmark/shared/clubs";
import { isUpgradeRequired } from "@bookmark/shared/entitlements";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import type { ClubList } from "@/lib/clubs";

// Starting a club (the web's /clubs/new): a name and, if you like, a line about it. Books come after, from
// the club. Free accounts host one active club and Plus any number; past the limit it says why.
export default function NewClub() {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<ClubList>("/api/clubs");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A refusal from the server (the limit was reached since the list loaded), shown like the list's own.
  const [refusal, setRefusal] = useState<{ message: string; upgrade: boolean } | null>(null);
  const hosting = data?.hosting;
  const blocked = (!!hosting && !hosting.allowed) || !!refusal;
  const blockedMessage = refusal?.message ?? hosting?.message ?? null;
  const upgrade = refusal?.upgrade ?? !!hosting?.upgrade;

  const start = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const club = await api.post<{ id: string; inviteCode: string }>("/api/clubs", { name: name.trim(), about: about.trim() });
      void mutate("/api/clubs");
      router.replace(`/clubs/${club.id}`);
    } catch (e) {
      if (e instanceof ApiError && isUpgradeRequired(e.body)) setRefusal({ message: e.message, upgrade: true });
      else if (e instanceof ApiError && e.status === 403) setRefusal({ message: e.message, upgrade: false });
      else setError(e instanceof ApiError ? e.message : "Couldn't start the club.");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text variant="display">Start a club</Text>
      <Text variant="muted">
        A club keeps the same readers from one book to the next. Share one link, and everyone who joins is added to each book you start. Up to {CLUB_MAX_MEMBERS} readers.
      </Text>
      {blocked && blockedMessage ? <Notice message={blockedMessage} /> : null}
      {blocked && upgrade && <Button title="Bookmark Plus" variant="outline" onPress={() => router.push("/plus")} />}
      <TextField label="Name" value={name} onChangeText={(t) => setName(t.slice(0, CLUB_NAME_MAX))} placeholder="Thursday Book Club" autoComplete="off" maxLength={CLUB_NAME_MAX} />
      <TextField
        label="About (optional)"
        value={about}
        onChangeText={(t) => setAbout(t.slice(0, CLUB_ABOUT_MAX))}
        placeholder="Where you meet, what you like to read"
        maxLength={CLUB_ABOUT_MAX}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 88, paddingTop: 12 }}
      />
      <Text variant="small">Shown on the club page and its invite.</Text>
      {error && <Notice tone="error" message={error} />}
      <Button title="Start the club" loading={saving} disabled={!name.trim() || blocked} onPress={start} />
    </Screen>
  );
}
