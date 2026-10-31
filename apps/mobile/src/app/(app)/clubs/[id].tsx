import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import useSWR, { useSWRConfig } from "swr";
import { Check, Ellipsis, Plus, Share2 } from "lucide-react-native";
import { formatPercent } from "@bookmark/shared/buddyReads";
import { CLUB_ABOUT_MAX, CLUB_MAX_MEMBERS, CLUB_NAME_MAX, canRemoveFromClub, circleSlotsLeft, type ClubRole } from "@bookmark/shared/clubs";
import { isUpgradeRequired } from "@bookmark/shared/entitlements";
import { readerName } from "@bookmark/shared/profile";
import { BookCover } from "@/components/books/BookCover";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { ROLE_LABEL, shareClubInvite, type ClubCircle, type ClubMember, type ClubView } from "@/lib/clubs";
import { goBack } from "@/lib/navigation";
import { useTheme } from "@/lib/theme";

// One club (the web's /clubs/<id>): what it's reading, what's next and what it's read, its one invite link,
// and its members. A book opens only for those in its circle. The host and co-hosts start the next book and
// remove members; only the host names co-hosts, renames or archives the club, and hands it over to leave.

const dayMonth = (date: string) => new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const monthYear = (date: string) => new Date(date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const shortMonthYear = (date: string) => new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data: view, error, isLoading, mutate } = useSWR<ClubView>(`/api/clubs/${id}`);
  const [editing, setEditing] = useState(false);
  const [handingOver, setHandingOver] = useState(false);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !view) {
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <Screen>
        <Text variant="display">{gone ? "Club not found" : "Couldn't load the club"}</Text>
        <Text variant="muted">{gone ? "You may have left it, or it was closed." : "Check your connection and try again."}</Text>
        {!gone && <Button title="Try again" variant="outline" onPress={() => mutate()} />}
      </Screen>
    );
  }

  const { club, viewer, members, reading, upcoming, past } = view;
  const archived = club.status === "ARCHIVED";
  const isHost = viewer.role === "host";
  const slots = circleSlotsLeft(reading.length + upcoming.length);
  const others = members.filter((m) => !m.isYou);
  // The club and the lists it shows up in.
  const refresh = () => {
    void mutate();
    void mutateGlobal("/api/clubs");
  };
  const left = () => {
    void mutateGlobal("/api/clubs");
    void mutateGlobal("/api/buddy-reads");
    goBack("/circles");
  };

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text variant="small" style={{ letterSpacing: 1 }}>CLUB{archived ? " · ARCHIVED" : ""}</Text>
        {editing ? (
          <EditClub clubId={club.id} name={club.name} about={club.about} onDone={(saved) => { setEditing(false); if (saved) refresh(); }} />
        ) : (
          <>
            <Text variant="display">{club.name}</Text>
            {club.about ? <Text variant="muted">{club.about}</Text> : null}
          </>
        )}
        <Text variant="small">
          {members.length} {members.length === 1 ? "member" : "members"} · Since {monthYear(club.createdAt)}
          {past.length > 0 ? ` · ${past.length} ${past.length === 1 ? "book" : "books"} read` : ""}
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="title">Reading now</Text>
        {reading.length > 0
          ? reading.map((c) => <CircleRow key={c.id} circle={c} />)
          : (
            <Text variant="muted">
              {upcoming.length > 0 ? "Nothing yet: the next book starts soon." : viewer.canManage ? "No book yet. Start one, and everyone in the club is added to it." : "No book yet. The host will start one soon."}
            </Text>
          )}
        {viewer.canManage && slots > 0 && (
          <Button title="Start the next book" icon={<Plus size={18} color={colors.onBrand} />} onPress={() => router.push(`/circles/new?clubId=${club.id}`)} />
        )}
      </View>

      {upcoming.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Up next</Text>
          {upcoming.map((c) => <CircleRow key={c.id} circle={c} upcoming />)}
        </View>
      )}

      {past.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text variant="title">Past reads</Text>
          <View style={styles.grid}>
            {past.map((c) => {
              const cover = <BookCover book={c} width={88} />;
              return (
                <View key={c.id} style={{ width: 88, gap: 4 }}>
                  {c.isMember ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={c.title} onPress={() => router.push(`/circles/${c.id}`)}>{cover}</Pressable>
                  ) : cover}
                  <Text variant="small">{shortMonthYear(c.startsAt)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {club.inviteCode && (
        <InviteSection clubId={club.id} code={club.inviteCode} name={club.name} full={members.length >= CLUB_MAX_MEMBERS} canReset={viewer.canManage} onReset={refresh} />
      )}

      <View style={{ gap: 10 }}>
        <Text variant="title">Members</Text>
        {members.map((m) => (
          <MemberRow key={m.userId} clubId={club.id} member={m} viewerRole={viewer.role} archived={archived} onChange={refresh} />
        ))}
        {isHost && !archived && <Text variant="small">Co-hosts can start the next book, change schedules, and invite and remove members.</Text>}
      </View>

      <View style={{ gap: 4, alignItems: "flex-start" }}>
        {isHost && !archived && !editing && <Button title="Edit name and about" variant="ghost" onPress={() => setEditing(true)} />}
        {isHost && <ClubStatusButton clubId={club.id} archived={archived} onChange={refresh} />}
        {isHost && others.length > 0 && <Button title="Hand over and leave" variant="ghost" onPress={() => setHandingOver(true)} />}
        {!isHost && <LeaveClubButton clubId={club.id} userId={viewer.userId} onLeft={left} />}
      </View>

      {handingOver && (
        <HandOverSheet clubId={club.id} viewerId={viewer.userId} members={others} onClose={() => setHandingOver(false)} onLeft={() => { setHandingOver(false); left(); }} />
      )}
    </Screen>
  );
}

// A book the club is reading or will read. Members open its circle; someone who joined the club after it
// started (and so isn't in it) sees the book only.
function CircleRow({ circle, upcoming }: { circle: ClubCircle; upcoming?: boolean }) {
  const { colors, radii } = useTheme();
  const inner = (
    <>
      <BookCover book={circle} width={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 16 }}>{circle.title}</Text>
        <Text variant="muted" numberOfLines={1}>{circle.author}</Text>
        <Text variant="small">
          {upcoming ? `Starts ${dayMonth(circle.startsAt)}` : `Started ${dayMonth(circle.startsAt)}`} · {circle.memberCount} {circle.memberCount === 1 ? "reader" : "readers"}
        </Text>
        {circle.isMember && !upcoming && circle.myProgress !== null && <Text variant="small" style={{ color: colors.foreground }}>You{"’"}re at {formatPercent(circle.myProgress)}</Text>}
        {!circle.isMember && <Text variant="small">You{"’"}re not in this one.</Text>}
      </View>
    </>
  );
  const box = [styles.row, { borderRadius: radii.lg, borderColor: colors.border }];
  if (!circle.isMember) return <View style={box}>{inner}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={circle.title}
      onPress={() => router.push(`/circles/${circle.id}`)}
      style={({ pressed }) => [...box, { backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      {inner}
    </Pressable>
  );
}

function EditClub({ clubId, name: initialName, about: initialAbout, onDone }: { clubId: string; name: string; about: string | null; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(initialName);
  const [about, setAbout] = useState(initialAbout ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/clubs/${clubId}`, { name: name.trim(), about: about.trim() });
      onDone(true);
    } catch (e) {
      setError(errorText(e, "Couldn't save the club."));
      setSaving(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <TextField label="Name" value={name} onChangeText={(t) => setName(t.slice(0, CLUB_NAME_MAX))} maxLength={CLUB_NAME_MAX} autoComplete="off" />
      <TextField
        label="About"
        value={about}
        onChangeText={(t) => setAbout(t.slice(0, CLUB_ABOUT_MAX))}
        placeholder="Where you meet, what you like to read"
        maxLength={CLUB_ABOUT_MAX}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 88, paddingTop: 12 }}
      />
      {error && <Notice tone="error" message={error} />}
      <View style={styles.actionRow}>
        <Button title="Save" loading={saving} disabled={!name.trim()} onPress={save} />
        <Button title="Cancel" variant="outline" disabled={saving} onPress={() => onDone(false)} />
      </View>
    </View>
  );
}

function InviteSection({ clubId, code, name, full, canReset, onReset }: { clubId: string; code: string; name: string; full: boolean; canReset: boolean; onReset: () => void }) {
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; message: string } | null>(null);

  const reset = async () => {
    setResetting(true);
    setNote(null);
    try {
      await api.post(`/api/clubs/${clubId}/invite-link`);
      setNote({ tone: "info", message: "Invite link reset. Share the new one." });
      onReset();
    } catch (e) {
      setNote({ tone: "error", message: errorText(e, "Couldn't reset the invite link.") });
    } finally {
      setResetting(false);
      setConfirming(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text variant="title">Invite readers</Text>
      {full ? (
        <Text variant="muted">The club is full ({CLUB_MAX_MEMBERS} readers).</Text>
      ) : (
        <>
          <Button title="Share invite link" variant="outline" icon={<Share2 size={18} color={colors.foreground} />} onPress={() => shareClubInvite(code, name)} />
          <Text variant="small">One link for the whole club. Whoever joins is added to the book it{"’"}s reading and every one after.</Text>
        </>
      )}
      {canReset && !confirming && <Button title="Reset link" variant="ghost" style={{ alignSelf: "flex-start" }} onPress={() => setConfirming(true)} />}
      {confirming && (
        <View style={{ gap: 8 }}>
          <Text>Reset the invite link? The old link stops working straight away. Everyone already in the club stays.</Text>
          <View style={styles.actionRow}>
            <Button title="Reset link" variant="outline" loading={resetting} onPress={reset} />
            <Button title="Keep it" variant="ghost" disabled={resetting} onPress={() => setConfirming(false)} />
          </View>
        </View>
      )}
      {note && <Notice tone={note.tone} message={note.message} />}
    </View>
  );
}

function MemberRow({ clubId, member, viewerRole, archived, onChange }: { clubId: string; member: ClubMember; viewerRole: ClubRole; archived: boolean; onChange: () => void }) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<"view" | "menu" | "remove">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = readerName(member) || "this reader";
  const canRemove = !member.isYou && !archived && canRemoveFromClub(viewerRole, member.role);
  const canPromote = !member.isYou && !archived && viewerRole === "host";
  const label = ROLE_LABEL[member.role];

  const setCoHost = async (coHost: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/clubs/${clubId}/members/${member.userId}`, { coHost });
      setMode("view");
      onChange();
    } catch (e) {
      setError(errorText(e, "Couldn't change their role."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/clubs/${clubId}/members/${member.userId}`);
      onChange();
    } catch (e) {
      setError(errorText(e, "Couldn't remove them."));
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.memberRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={member.isYou ? "You" : who}
          disabled={!member.username}
          onPress={() => member.username && router.push(`/u/${member.username}`)}
          style={styles.memberName}
        >
          <Avatar image={member.image} name={member.username} colour={member.favColour} size={32} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
            {member.isYou ? "You" : readerName(member) || "A reader"}
            {!member.isYou && member.staffBadge ? <StaffSeal kind={member.staffBadge} size={16} pressable={false} style={styles.seal} /> : null}
          </Text>
        </Pressable>
        {label && <Text variant="small">{label}</Text>}
        {(canRemove || canPromote) && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${who}`} hitSlop={8} onPress={() => setMode(mode === "view" ? "menu" : "view")} style={styles.more}>
            <Ellipsis size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {mode === "menu" && (
        <View style={styles.actionRow}>
          {canPromote && member.role === "member" && <Button title="Make co-host" variant="ghost" disabled={busy} onPress={() => setCoHost(true)} />}
          {canPromote && member.role === "cohost" && <Button title="Remove as co-host" variant="ghost" disabled={busy} onPress={() => setCoHost(false)} />}
          {canRemove && <Button title="Remove from club" variant="ghost" disabled={busy} onPress={() => setMode("remove")} />}
        </View>
      )}
      {mode === "remove" && (
        <View style={{ gap: 8 }}>
          <Text>Remove {who} from the club? They{"’"}ll leave the books it{"’"}s reading now, and the invite link won{"’"}t let them back in.</Text>
          <View style={styles.actionRow}>
            <Button title="Remove" variant="outline" loading={busy} onPress={remove} />
            <Button title="Keep them" variant="ghost" disabled={busy} onPress={() => setMode("view")} />
          </View>
        </View>
      )}
      {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

// Host only: archiving closes the link and leaves the club's circles as they are. Reopening counts against
// the hosting limit again, so it can come back refused with the Plus prompt.
function ClubStatusButton({ clubId, archived, onChange }: { clubId: string; archived: boolean; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; upgrade: boolean } | null>(null);

  const setStatus = async (status: "ACTIVE" | "ARCHIVED") => {
    setBusy(true);
    setRefusal(null);
    try {
      await api.patch(`/api/clubs/${clubId}`, { status });
      setConfirming(false);
      onChange();
    } catch (e) {
      setRefusal({ message: errorText(e, "Couldn't update the club."), upgrade: e instanceof ApiError && isUpgradeRequired(e.body) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      {archived ? (
        <Button title="Reopen the club" variant="outline" loading={busy} onPress={() => setStatus("ACTIVE")} />
      ) : confirming ? (
        <View style={{ gap: 8 }}>
          <Text>Archive this club? Its invite link stops working, no new books can be started, and the books it's reading are marked finished. Their discussions stay open.</Text>
          <View style={styles.actionRow}>
            <Button title="Archive" variant="outline" loading={busy} onPress={() => setStatus("ARCHIVED")} />
            <Button title="Keep it" variant="ghost" disabled={busy} onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <Button title="Archive the club" variant="ghost" style={{ alignSelf: "flex-start" }} onPress={() => setConfirming(true)} />
      )}
      {refusal && <Notice tone={refusal.upgrade ? "info" : "error"} message={refusal.message} />}
      {refusal?.upgrade && <Button title="Bookmark Plus" variant="outline" onPress={() => router.push("/plus")} />}
    </View>
  );
}

function LeaveClubButton({ clubId, userId, onLeft }: { clubId: string; userId: string; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) return <Button title="Leave the club" variant="ghost" onPress={() => setConfirming(true)} />;
  const leave = async () => {
    setLeaving(true);
    setError(null);
    try {
      await api.delete(`/api/clubs/${clubId}/members/${userId}`);
      onLeft();
    } catch (e) {
      setError(errorText(e, "Couldn't leave the club."));
      setLeaving(false);
    }
  };
  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      <Text>Leave this club? You{"’"}ll leave the books it{"’"}s reading now. The books stay on your shelf, and the ones you{"’"}ve finished stay in your history.</Text>
      {error && <Notice tone="error" message={error} />}
      <Button title="Leave" variant="outline" loading={leaving} onPress={leave} />
      <Button title="Stay" variant="ghost" disabled={leaving} onPress={() => setConfirming(false)} />
    </View>
  );
}

// The host leaves by choosing who hosts after them (the web's HandOverDialog with `club`). The
// longest-standing member is picked to start with.
function HandOverSheet({ clubId, viewerId, members, onClose, onLeft }: { clubId: string; viewerId: string; members: ClubMember[]; onClose: () => void; onLeft: () => void }) {
  const { colors, radii } = useTheme();
  const [chosen, setChosen] = useState<string | null>(members[0]?.userId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/clubs/${clubId}/members/${viewerId}?newHost=${chosen}`);
      onLeft();
    } catch (e) {
      setError(errorText(e, "Couldn't hand the club over."));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Hand over and leave" onClose={busy ? () => {} : onClose}>
      <View style={{ gap: 12 }}>
        <Text variant="muted">The new host can choose co-hosts, start the next book, invite and remove members, and archive the club. You{"’"}ll leave the books it{"’"}s reading now; the ones you{"’"}ve finished stay in your history.</Text>
        <Text variant="label">Who should host next?</Text>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          {members.map((m, i) => {
            const selected = chosen === m.userId;
            return (
              <Pressable
                key={m.userId}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={readerName(m) || "Reader"}
                onPress={() => setChosen(m.userId)}
                style={[styles.choice, { borderRadius: radii.md, borderColor: selected ? colors.foreground : colors.input }]}
              >
                <Avatar image={m.image} name={m.username} colour={m.favColour} size={32} />
                <Text numberOfLines={1} style={{ flex: 1 }}>{readerName(m) || "A reader"}</Text>
                {i === 0 && <Text variant="small">Here longest</Text>}
                {selected && <Check size={16} color={colors.foreground} />}
              </Pressable>
            );
          })}
        </View>
        {error && <Notice tone="error" message={error} />}
        <Button title="Hand over and leave" loading={busy} disabled={!chosen} onPress={leave} />
        <Button title="Stay" variant="outline" disabled={busy} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  row: { flexDirection: "row", gap: 12, padding: 12, borderWidth: 1, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  memberName: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  more: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
});
