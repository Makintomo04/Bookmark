import { useEffect, useState } from "react";
import { readerName } from "@bookmark/shared/profile";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import useSWR from "swr";
import { Check, Ellipsis, Lock, Share2, UserPlus } from "lucide-react-native";
import { BUDDY_READ_EMOJI, BUDDY_READ_MAX_MEMBERS, BUDDY_READ_REFRESH_MS, COMMENT_MAX, COMMENT_REPORT_REASONS, formatPercent, type BuddyReadSchedule, type SerializedComment, type UnlockedComment } from "@bookmark/shared/buddyReads";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { BookCover } from "@/components/books/BookCover";
import { FriendsPicker } from "@/components/circles/FriendsPicker";
import { Avatar } from "@/components/profile/Avatar";
import { StaffSeal } from "@/components/profile/StaffSeal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { goBack } from "@/lib/navigation";
import { formatDay } from "@/lib/books";
import { shareInvite, type CircleMember, type CircleView } from "@/lib/circles";
import { shareClubInvite } from "@/lib/clubs";
import { useTheme } from "@/lib/theme";

// One reading circle (the web's /circles/<id>): everyone's progress, the invite link, and the
// discussion. The lock is the server's: a comment past your progress arrives without its words or its
// author, so the app can only show where it is. Refreshes every 20 seconds while open, like the web.
// Handing over hosting stays on the web for now. A club's book (BOO-49) names its club, shares the club's link
// (whoever joins is in for every book), and the club's host and co-hosts can run it and remove readers, which
// they keep once the club is archived. An archived club's books take no one new, so there's no link to share.

export default function CircleScreen() {
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string }>();
  const { colors } = useTheme();
  const { data: view, error, isLoading, mutate } = useSWR<CircleView>(`/api/buddy-reads/${id}`, { refreshInterval: BUDDY_READ_REFRESH_MS });
  const [replyTo, setReplyTo] = useState<UnlockedComment | null>(null);
  const [pickingFriends, setPickingFriends] = useState(false);

  if (isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (error || !view) {
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <Screen>
        <Text variant="display">{gone ? "Reading circle not found" : "Couldn't load the circle"}</Text>
        <Text variant="muted">{gone ? "You may have left it, or it was closed." : "Check your connection and try again."}</Text>
        {!gone && <Button title="Try again" variant="outline" onPress={() => mutate()} />}
      </Screen>
    );
  }

  const { buddyRead, club, viewer, members, comments } = view;
  const share = () => (club?.inviteCode ? shareClubInvite(club.inviteCode, club.name) : shareInvite(buddyRead.inviteCode, buddyRead.title));
  // An archived club's books take only its members (the server's clubBookRefusal), so there's nothing to share.
  const clubClosed = !!club && !club.inviteCode;
  const archived = buddyRead.status === "ARCHIVED";
  const ordered = [...members].sort((a, b) => b.progress - a.progress);

  return (
    <Screen>
      <View style={styles.bookRow}>
        <BookCover book={buddyRead} width={76} />
        <View style={{ flex: 1, gap: 4 }}>
          {club && (
            <Pressable accessibilityRole="link" accessibilityLabel={club.name} hitSlop={6} onPress={() => router.push(`/clubs/${club.id}`)}>
              <Text variant="small" style={{ color: colors.foreground, textDecorationLine: "underline" }}>{club.name}</Text>
            </Pressable>
          )}
          <Text variant="small" style={{ letterSpacing: 1 }}>READING CIRCLE{buddyRead.status !== "ACTIVE" ? ` · ${buddyRead.status === "FINISHED" ? "FINISHED" : "ARCHIVED"}` : ""}</Text>
          <Text variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{buddyRead.title}</Text>
          <Text variant="muted">{buddyRead.author}</Text>
          <Text variant="small">Started {formatDay(buddyRead.startsAt)}{viewer.isHost ? " · you host" : ""}</Text>
        </View>
      </View>

      {invite === "1" && members.length === 1 && <Notice message="Your circle is ready. Share the link so friends can join; anyone with it can read along." />}
      {!clubClosed && !archived && <Button title={club?.inviteCode ? "Share the club's invite link" : "Share invite link"} variant={members.length === 1 ? "primary" : "outline"} icon={<Share2 size={18} color={members.length === 1 ? colors.onBrand : colors.foreground} />} onPress={share} />}
      {club?.inviteCode && <Text variant="small">Whoever joins with it joins the club, so they{"’"}re in for this book and the next.</Text>}
      {!archived && !clubClosed && members.length < BUDDY_READ_MAX_MEMBERS && (
        <Button title="Invite friends" variant="outline" icon={<UserPlus size={18} color={colors.foreground} />} onPress={() => setPickingFriends(true)} />
      )}
      {pickingFriends && (
        <FriendsPicker
          circleId={buddyRead.id}
          memberUsernames={members.flatMap((m) => (m.username ? [m.username] : []))}
          room={BUDDY_READ_MAX_MEMBERS - members.length}
          onClose={() => setPickingFriends(false)}
        />
      )}

      <View style={{ gap: 10 }}>
        <View style={styles.between}>
          <Text variant="title">Where everyone is</Text>
          <Button title="Update yours" variant="ghost" onPress={() => router.push(`/book/${viewer.bookId}`)} />
        </View>
        {ordered.map((m) => <MemberRow key={m.userId} circleId={buddyRead.id} member={m} onChange={() => mutate()} />)}
      </View>

      <Schedule schedule={buddyRead.schedule ?? []} progress={viewer.progress} canEdit={viewer.canManage} circleId={buddyRead.id} />

      <Discussion circleId={buddyRead.id} comments={comments} progress={viewer.progress} isHost={viewer.canModerate ?? viewer.canManage} onReply={setReplyTo} onChange={() => mutate()} />
      {/* A finished book stays open for talk, as on the web; only an archived one is closed. */}
      {!archived && (
        <Composer circleId={buddyRead.id} progress={viewer.progress} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onPosted={() => { setReplyTo(null); void mutate(); }} />
      )}

      <MuteButton circleId={buddyRead.id} userId={viewer.userId} muted={viewer.muted} onChange={() => mutate()} />
      {!viewer.isHost && <LeaveButton circleId={buddyRead.id} userId={viewer.userId} />}
    </Screen>
  );
}

// In a club's book the club's roles come first (its host, then co-hosts), then whoever started this book, as on the web.
function roleLabel(m: CircleMember) {
  if (m.clubRole === "host") return "Club host";
  if (m.clubRole === "cohost") return "Co-host";
  return m.isHost ? "host" : null;
}

function MemberRow({ circleId, member, onChange }: { circleId: string; member: CircleMember; onChange: () => void }) {
  const { colors } = useTheme();
  const colour = member.favColour || DEFAULT_COLOUR;
  const [mode, setMode] = useState<"view" | "remove">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = readerName(member) || "this reader";
  const role = roleLabel(member);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/buddy-reads/${circleId}/members/${member.userId}`);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't remove them.");
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.memberRow} accessible={!member.removable} accessibilityLabel={`${member.isYou ? "You" : readerName(member) || "A reader"}, ${formatPercent(member.progress)}`}>
        <Avatar image={member.image} name={member.username} colour={member.favColour} size={32} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.between}>
            <Text style={{ fontSize: 15 }}>{member.isYou ? "You" : readerName(member) || "A reader"}{!member.isYou && member.staffBadge ? <StaffSeal kind={member.staffBadge} size={16} pressable={false} style={styles.seal} /> : null}{role ? ` · ${role}` : ""}</Text>
            <Text variant="small">{member.finishedAt ? "Finished" : formatPercent(member.progress)}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={[styles.fill, { width: `${Math.min(100, member.progress)}%`, backgroundColor: colour }]} />
          </View>
        </View>
        {member.removable && mode === "view" && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${who}`} hitSlop={8} onPress={() => setMode("remove")}>
            <Ellipsis size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {mode === "remove" && (
        <View style={{ gap: 8 }}>
          <Text>Remove {who}? Their comments stay, under their name, and the invite link won{"’"}t let them back in.</Text>
          <View style={styles.actionRow}>
            <Button title="Remove" variant="outline" loading={busy} onPress={remove} />
            <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => setMode("view")} />
          </View>
          {error && <Text variant="small" style={{ color: colors.danger }}>{error}</Text>}
        </View>
      )}
    </View>
  );
}

// The plan, if the host made one: checkpoints as a percent (any edition), with an optional date. Ones
// you've reached are ticked.
function Schedule({ schedule, progress, canEdit, circleId }: { schedule: BuddyReadSchedule; progress: number; canEdit: boolean; circleId: string }) {
  const { colors } = useTheme();
  if (schedule.length === 0 && !canEdit) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.between}>
        <Text variant="title">Schedule</Text>
        {canEdit && <Button title={schedule.length ? "Edit" : "Add a schedule"} variant="ghost" onPress={() => router.push(`/circles/schedule/${circleId}`)} />}
      </View>
      {schedule.length === 0 && <Text variant="muted">No schedule. Add checkpoints so everyone knows how far to read by when.</Text>}
      {schedule.map((s, i) => {
        const reached = typeof s.until === "number" && progress >= s.until;
        return (
          <View key={i} style={styles.scheduleRow} accessible accessibilityLabel={`${s.label}${typeof s.until === "number" ? `, to ${formatPercent(s.until)}` : ""}${s.due ? `, by ${dueDay(s.due)}` : ""}${reached ? ", reached" : ""}`}>
            <View style={[styles.check, { borderColor: reached ? colors.brand : colors.input, backgroundColor: reached ? colors.brand : "transparent" }]}>
              {reached && <Check size={12} color="#ffffff" />}
            </View>
            <Text style={{ flex: 1 }}>{s.label}</Text>
            <Text variant="small">{[typeof s.until === "number" ? `to ${formatPercent(s.until)}` : null, s.due ? `by ${dueDay(s.due)}` : null].filter(Boolean).join(" · ")}</Text>
          </View>
        );
      })}
    </View>
  );
}

const dueDay = (due: string) => new Date(`${due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Discussion({ circleId, comments, progress, isHost, onReply, onChange }: { circleId: string; comments: SerializedComment[]; progress: number; isHost: boolean; onReply: (c: UnlockedComment) => void; onChange: () => void }) {
  const locked = comments.filter((c) => c.locked).length;
  return (
    <View style={{ gap: 12 }}>
      <Text variant="title">Discussion</Text>
      {comments.length === 0 && <Text variant="muted">No comments yet. Say something about where you are; others see it once they reach the same point.</Text>}
      {locked > 0 && <Text variant="small">{locked === 1 ? "One comment is" : `${locked} comments are`} ahead of you at {formatPercent(progress)}. Read on to unlock {locked === 1 ? "it" : "them"}.</Text>}
      {comments.map((c) => <Comment key={c.id} circleId={circleId} comment={c} isHost={isHost} onReply={onReply} onChange={onChange} />)}
    </View>
  );
}

function Comment({ circleId, comment, isHost, onReply, onChange, nested }: { circleId: string; comment: SerializedComment; isHost: boolean; onReply: (c: UnlockedComment) => void; onChange: () => void; nested?: boolean }) {
  const { colors, radii, fonts } = useTheme();
  const [mode, setMode] = useState<"view" | "menu" | "edit" | "report" | "reported">("view");
  const box = [styles.comment, { borderRadius: radii.md, backgroundColor: nested ? "transparent" : colors.card, borderColor: colors.border }, nested && styles.nested];

  if (comment.locked) {
    return (
      <View style={[box, styles.lockedRow]} accessible accessibilityLabel={`Locked comment at ${formatPercent(comment.position)}`}>
        <View style={[styles.dot, { backgroundColor: comment.authorColour }]} />
        <Lock size={14} color={colors.mutedForeground} />
        <Text variant="muted" style={{ flex: 1 }}>Locked until {formatPercent(comment.position)}{comment.replyCount ? ` · ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}` : ""}</Text>
      </View>
    );
  }

  const where = comment.chapterLabel || (comment.pageLabel ? `Page ${comment.pageLabel}` : null) || `At ${formatPercent(comment.position)}`;
  const name = comment.deleted ? null : comment.formerMember ? "Former member" : comment.author?.username ? readerName(comment.author) : "A reader";

  const react = async (emoji: string) => {
    await api.post(`/api/buddy-reads/${circleId}/comments/${comment.id}/reactions`, { emoji }).catch(() => {});
    onChange();
  };

  return (
    <View style={box}>
      <View style={styles.commentHead}>
        {!comment.deleted && <Avatar image={comment.author?.image} name={comment.author?.username} colour={comment.author?.favColour} size={24} />}
        <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 14 }}>{name ?? "Comment removed"}</Text>
        {!comment.deleted && !comment.formerMember && comment.author?.staffBadge ? <StaffSeal kind={comment.author.staffBadge} name={name} size={18} /> : null}
        <Text variant="small">· {where}{comment.editedAt ? " · edited" : ""}</Text>
        {!comment.deleted && (
          <Pressable accessibilityRole="button" accessibilityLabel="More actions" hitSlop={8} onPress={() => setMode(mode === "menu" ? "view" : "menu")} style={{ marginLeft: "auto" }}>
            <Ellipsis size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {mode === "edit" ? (
        <EditComment circleId={circleId} comment={comment} onDone={(changed) => { setMode("view"); if (changed) onChange(); }} />
      ) : comment.body ? <Text>{comment.body}</Text> : null}
      {mode === "menu" && <CommentMenu circleId={circleId} comment={comment} isHost={isHost} onEdit={() => setMode("edit")} onReport={() => setMode("report")} onDeleted={onChange} onClose={() => setMode("view")} />}
      {mode === "report" && <ReportComment circleId={circleId} commentId={comment.id} onDone={(sent) => setMode(sent ? "reported" : "view")} />}
      {mode === "reported" && <Text variant="small">Thanks. The Bookmark team will take a look; nobody else can see that you reported it.</Text>}
      {!comment.deleted && mode !== "edit" && (
        <View style={styles.reactions}>
          {BUDDY_READ_EMOJI.map((emoji) => {
            const summary = comment.reactions.find((r) => r.emoji === emoji);
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`${emoji} ${summary?.count ?? 0}${summary?.mine ? ", yours" : ""}`}
                onPress={() => react(emoji)}
                style={[styles.reaction, { borderColor: summary?.mine ? colors.brandFill : colors.border }]}
              >
                <Text style={{ fontSize: 13 }}>{emoji}{summary ? ` ${summary.count}` : ""}</Text>
              </Pressable>
            );
          })}
          {!nested && <Button title="Reply" variant="ghost" onPress={() => onReply(comment)} />}
        </View>
      )}
      {comment.replies.map((r) => <Comment key={r.id} circleId={circleId} comment={r} isHost={isHost} onReply={onReply} onChange={onChange} nested />)}
    </View>
  );
}

// Yours: edit or delete. The host can delete anyone's. Anyone else's can be reported.
function CommentMenu({ circleId, comment, isHost, onEdit, onReport, onDeleted, onClose }: { circleId: string; comment: UnlockedComment; isHost: boolean; onEdit: () => void; onReport: () => void; onDeleted: () => void; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    await api.delete(`/api/buddy-reads/${circleId}/comments/${comment.id}`).catch(() => {});
    onDeleted();
  };
  if (confirm) {
    return (
      <View style={{ gap: 6 }}>
        <Text>{comment.mine ? "Delete your comment?" : "Delete this comment for everyone?"} Replies to it stay.</Text>
        <View style={styles.actionRow}>
          <Button title="Delete" variant="outline" loading={busy} onPress={remove} />
          <Button title="Keep it" variant="ghost" disabled={busy} onPress={onClose} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.actionRow}>
      {comment.mine && <Button title="Edit" variant="ghost" onPress={onEdit} />}
      {(comment.mine || isHost) && <Button title="Delete" variant="ghost" onPress={() => setConfirm(true)} />}
      {!comment.mine && <Button title="Report" variant="ghost" onPress={onReport} />}
    </View>
  );
}

function EditComment({ circleId, comment, onDone }: { circleId: string; comment: UnlockedComment; onDone: (changed: boolean) => void }) {
  const [body, setBody] = useState(comment.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!body.trim()) return setError("Write something first");
    setSaving(true);
    try {
      await api.patch(`/api/buddy-reads/${circleId}/comments/${comment.id}`, { body: body.trim() });
      onDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save that. Try again.");
      setSaving(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <TextField label="Edit your comment" value={body} onChangeText={(t) => setBody(t.slice(0, COMMENT_MAX))} multiline textAlignVertical="top" style={{ minHeight: 80, paddingTop: 12 }} error={error} autoFocus />
      <View style={styles.actionRow}>
        <Button title="Save" loading={saving} onPress={save} />
        <Button title="Cancel" variant="ghost" disabled={saving} onPress={() => onDone(false)} />
      </View>
    </View>
  );
}

function ReportComment({ circleId, commentId, onDone }: { circleId: string; commentId: string; onDone: (sent: boolean) => void }) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (reason: string) => {
    setSending(reason);
    try {
      await api.post(`/api/buddy-reads/${circleId}/comments/${commentId}/report`, { reason });
      onDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send the report. Try again.");
      setSending(null);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">What's wrong with it?</Text>
      <View style={styles.reasons}>
        {COMMENT_REPORT_REASONS.map((reason) => <Chip key={reason} label={sending === reason ? "Sending…" : reason} selected={false} disabled={!!sending} onPress={() => send(reason)} />)}
      </View>
      {error && <Text variant="small">{error}</Text>}
      <Button title="Cancel" variant="ghost" disabled={!!sending} onPress={() => onDone(false)} />
    </View>
  );
}

function Composer({ circleId, progress, replyTo, onCancelReply, onPosted }: { circleId: string; progress: number; replyTo: UnlockedComment | null; onCancelReply: () => void; onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async () => {
    if (!body.trim()) return setError("Write something first");
    setPosting(true);
    setError(null);
    try {
      await api.post(`/api/buddy-reads/${circleId}/comments`, { body: body.trim(), ...(replyTo && { parentId: replyTo.id }) });
      setBody("");
      onPosted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't post that. Try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {replyTo && (
        <View style={styles.between}>
          <Text variant="small">Replying to {replyTo.author?.username ? `@${replyTo.author.username}` : "a comment"}</Text>
          <Button title="Cancel" variant="ghost" onPress={onCancelReply} />
        </View>
      )}
      <TextField
        label={replyTo ? "Your reply" : `Comment at ${formatPercent(progress)}`}
        value={body}
        onChangeText={(t) => setBody(t.slice(0, COMMENT_MAX))}
        placeholder="What do you think so far?"
        multiline
        textAlignVertical="top"
        style={{ minHeight: 88, paddingTop: 12 }}
        error={error}
      />
      <Text variant="small">Others see it once they reach {formatPercent(progress)}.</Text>
      <Button title={replyTo ? "Reply" : "Post"} loading={posting} onPress={post} />
    </View>
  );
}

// Muting is per circle and only for you: no comment notifications from it. Shown straight away, then put
// back if the server says no.
function MuteButton({ circleId, userId, muted, onChange }: { circleId: string; userId: string; muted: boolean; onChange: () => void }) {
  const [shown, setShown] = useState(muted);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setShown(muted), [muted]);
  const toggle = async () => {
    const next = !shown;
    setShown(next);
    setNote(null);
    try {
      await api.patch(`/api/buddy-reads/${circleId}/members/${userId}`, { muted: next });
      onChange();
    } catch (e) {
      setShown(!next);
      setNote(e instanceof ApiError ? e.message : "Couldn't change that. Try again.");
    }
  };
  return (
    <View style={{ gap: 4 }}>
      <Button title={shown ? "Unmute this circle" : "Mute this circle"} variant="ghost" onPress={toggle} />
      <Text variant="small">{note ?? `${shown ? "You won't hear about new comments here." : "Stop hearing about new comments here."} Invites and hosting changes still reach you.`}</Text>
    </View>
  );
}

function LeaveButton({ circleId, userId }: { circleId: string; userId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!confirming) return <Button title="Leave this circle" variant="ghost" onPress={() => setConfirming(true)} />;
  return (
    <View style={{ gap: 8 }}>
      <Text>Leave the circle? Your comments stay, and you can rejoin with the invite link.</Text>
      <Button
        title="Leave"
        variant="outline"
        loading={leaving}
        onPress={async () => {
          setLeaving(true);
          await api.delete(`/api/buddy-reads/${circleId}/members/${userId}`).catch(() => {});
          goBack();
        }}
      />
      <Button title="Stay" variant="ghost" disabled={leaving} onPress={() => setConfirming(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline in a line of text, so lifted a touch to sit on its middle.
  seal: { marginLeft: 4, transform: [{ translateY: 2 }] },
  bookRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  memberRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  comment: { gap: 8, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  nested: { borderWidth: 0, borderLeftWidth: 2, paddingVertical: 4, paddingRight: 0, marginLeft: 4 },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  reaction: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, minHeight: 30, justifyContent: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  check: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
