import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { Check, Plus, X } from "lucide-react-native";
import { VOTE_DAYS_DEFAULT, VOTE_NOMINATIONS_MAX, closesInText, settledVoteText, turnoutText } from "@bookmark/shared/clubVotes";
import { readerName } from "@bookmark/shared/profile";
import { BookCover } from "@/components/books/BookCover";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api } from "@/lib/api";
import { useBooks } from "@/lib/books";
import type { ClubNomination, ClubVoteView } from "@/lib/clubs";
import { useTheme } from "@/lib/theme";

// The club picks its next book (BOO-49 phase 2; the web's ClubVoteSection): open a vote, put books up from
// your shelf, vote, and once it's closed the result and a host's "Start this book". Counts stay hidden
// until it closes.

const DAY_CHOICES = [1, 2, 3, 5, 7, 14];
// Anything on the shelf can be put up, apart from books the reader said they won't read.
const NOMINABLE = new Set(["STARTED", "PAUSED", "NOT_STARTED", "FINISHED", "DNF"]);
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

// "ana, ben and 3 others": only people the viewer may see named (the server decides).
function votersText(n: ClubNomination) {
  const names = (n.voters ?? []).map((v) => (v.isYou ? "you" : readerName(v))).filter(Boolean) as string[];
  const others = n.otherVoters ?? 0;
  if (names.length === 0) return others > 0 ? `${others} ${others === 1 ? "vote" : "votes"}` : "No votes";
  const shown = names.slice(0, 3);
  const more = names.length - shown.length + others;
  return `${shown.join(", ")}${more > 0 ? ` and ${more} ${more === 1 ? "other" : "others"}` : ""}`;
}

export function ClubVote({ clubId, canManage, archived }: { clubId: string; canManage: boolean; archived: boolean }) {
  const { colors, radii } = useTheme();
  const { data: view, mutate } = useSWR<ClubVoteView>(`/api/clubs/${clubId}/votes`);
  const [opening, setOpening] = useState(false);
  const [days, setDays] = useState(VOTE_DAYS_DEFAULT);
  const [hostsOnly, setHostsOnly] = useState(false);
  const [nominating, setNominating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `at`: the book the confirmation is about. It's shown in that book's row, where the tap was, not at the
  // foot of the card below the fold.
  const [confirm, setConfirm] = useState<{ message: string; title: string; run: () => Promise<unknown>; at?: string } | null>(null);

  if (!view || archived) return null;
  const { vote, viewer, nominations } = view;

  const act = async (run: () => Promise<unknown>, fallback: string, then?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      then?.();
      await mutate();
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const confirmBox = confirm && (
    <View style={{ gap: 8 }}>
      <Text>{confirm.message}</Text>
      <View style={styles.actionRow}>
        <Button title={confirm.title} variant="outline" loading={busy} onPress={() => act(confirm.run, "Something went wrong. Try again.")} />
        <Button title="Not now" variant="ghost" disabled={busy} onPress={() => setConfirm(null)} />
      </View>
    </View>
  );

  if (!vote) {
    if (!canManage) return null;
    return (
      <View style={{ gap: 10 }}>
        <Text variant="title">Vote on the next book</Text>
        {!opening ? (
          <>
            <Text variant="muted">Let the club choose what it reads next. Members put books up from their shelves and everyone votes.</Text>
            <Button title="Open a vote" variant="outline" onPress={() => setOpening(true)} />
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <Text variant="label">How long it runs</Text>
            <View style={styles.chips}>
              {DAY_CHOICES.map((d) => (
                <Pressable key={d} accessibilityRole="radio" accessibilityState={{ checked: days === d }} onPress={() => setDays(d)}
                  style={[styles.chip, { borderRadius: radii.md, borderColor: days === d ? colors.foreground : colors.input }]}>
                  <Text>{d} {d === 1 ? "day" : "days"}</Text>
                </Pressable>
              ))}
            </View>
            <Text variant="label">Who puts books up</Text>
            {[{ value: false, label: "Everyone, one book each" }, { value: true, label: "Only you and your co-hosts, as a shortlist" }].map((o) => (
              <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ checked: hostsOnly === o.value }} onPress={() => setHostsOnly(o.value)}
                style={[styles.choice, { borderRadius: radii.md, borderColor: hostsOnly === o.value ? colors.foreground : colors.input }]}>
                <Text style={{ flex: 1 }}>{o.label}</Text>
                {hostsOnly === o.value && <Check size={16} color={colors.foreground} />}
              </Pressable>
            ))}
            <Text variant="small">Everyone in the club is told. Votes stay hidden until it closes, then the book with the most wins. If it{"’"}s a tie, you pick.</Text>
            {error && <Notice tone="error" message={error} />}
            <View style={styles.actionRow}>
              <Button title="Open the vote" loading={busy} onPress={() => act(() => api.post(`/api/clubs/${clubId}/votes`, { days, hostsOnly }), "Couldn't open the vote.", () => setOpening(false))} />
              <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => setOpening(false)} />
            </View>
          </View>
        )}
      </View>
    );
  }

  const open = vote.status === "OPEN";
  const tied = vote.status === "TIED";
  const settled = settledVoteText(vote, viewer.canRun);
  const winner = vote.status === "CLOSED" ? nominations.find((n) => n.id === vote.winnerId) : undefined;
  const ranked = (open ? nominations : [...nominations].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))).filter((n) => n.id !== winner?.id);

  const startWinner = () => act(async () => {
    const { bookId } = await api.post<{ bookId: string }>(`/api/clubs/${clubId}/votes/${vote.id}/winner-copy`);
    router.push(`/circles/new?clubId=${clubId}&bookId=${bookId}`);
  }, "Couldn't get the book ready.");

  return (
    <View style={{ gap: 10 }}>
      <Text variant="title">{open ? "Vote on the next book" : settled.heading}</Text>
      <Text variant="small">{open ? `${closesInText(vote.closesAt)} · ${turnoutText(vote.voted, vote.memberCount)}` : settled.line}</Text>

      {winner && (
        <View style={[styles.row, { borderRadius: radii.lg, borderColor: colors.border }]}>
          <BookCover book={winner} width={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: 16 }}>{winner.title}</Text>
            <Text variant="muted" numberOfLines={1}>{winner.author}</Text>
            <Text variant="small">{winner.votes} {winner.votes === 1 ? "vote" : "votes"} · {votersText(winner)}</Text>
          </View>
        </View>
      )}
      {winner && confirm?.at === winner.id ? confirmBox : winner && (viewer.canRun ? (
        <View style={styles.actionRow}>
          <Button title="Start this book" loading={busy} onPress={startWinner} />
          {!confirm && <Button title="Not now" variant="ghost" disabled={busy} onPress={() => setConfirm({ at: winner.id, message: `Put this away without starting ${winner.title}? The club page stops showing it.`, title: "Put it away", run: () => api.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "dismiss" }) })} />}
        </View>
      ) : <Text variant="muted">The host will start it soon.</Text>)}

      {(open || tied || ranked.length > 0) && ranked.map((n) => {
        const mine = viewer.myBallot === n.id;
        const inTie = tied && vote.tiedIds.includes(n.id);
        return (
          <View key={n.id} style={[styles.row, { borderRadius: radii.lg, borderColor: mine ? colors.foreground : colors.border }]}>
            <BookCover book={n} width={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={2}>{n.title}</Text>
              <Text variant="small" numberOfLines={1}>{n.author}{n.nominatedBy ? ` · put up by ${n.isMine ? "you" : readerName(n.nominatedBy)}` : ""}</Text>
              {n.votes !== null && <Text variant="small">{n.votes} {n.votes === 1 ? "vote" : "votes"}{n.votes > 0 ? ` · ${votersText(n)}` : ""}</Text>}
              {confirm?.at === n.id ? confirmBox : <View style={styles.actionRow}>
                {open && viewer.canVote && (
                  <Button title={mine ? "Your vote" : "Vote"} variant={mine ? "primary" : "outline"} disabled={busy || mine} icon={mine ? <Check size={16} color={colors.onBrand} /> : undefined}
                    onPress={() => act(() => api.put(`/api/clubs/${clubId}/votes/${vote.id}/ballot`, { nominationId: n.id }), "Couldn't record your vote.")} />
                )}
                {inTie && viewer.canRun && (
                  <Button title="Pick this one" disabled={busy} onPress={() => setConfirm({ at: n.id, message: `Make ${n.title} the club’s next book?`, title: "Pick it", run: () => api.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "pick", nominationId: n.id }) })} />
                )}
              </View>}
            </View>
            {n.removable && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Take down ${n.title}`} hitSlop={8} style={styles.icon}
                onPress={() => setConfirm({ at: n.id, message: n.isMine ? "Take your book down? Votes for it are dropped." : `Take down ${n.title}? Votes for it are dropped, and those members can vote again.`, title: "Take it down", run: () => api.delete(`/api/clubs/${clubId}/votes/${vote.id}/nominations/${n.id}`) })}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        );
      })}

      {open && nominations.length === 0 && <Text variant="muted">No books yet. {viewer.canNominate ? "Put one up from your shelf." : vote.hostsOnly ? "The host is choosing the shortlist." : ""}</Text>}
      {open && viewer.canNominate && nominations.length < VOTE_NOMINATIONS_MAX && (
        <Button title="Put a book up" variant="outline" icon={<Plus size={18} color={colors.foreground} />} onPress={() => setNominating(true)} />
      )}
      {open && viewer.muted && <Text variant="small">A host has muted you in this club, so you can vote but not put a book up.</Text>}
      {open && <Text variant="small">Votes stay hidden until the vote closes. You can change yours until then.</Text>}
      {open && viewer.canRun && !confirm && (
        <View style={styles.actionRow}>
          <Button title="Close now" variant="ghost" disabled={busy || nominations.length === 0} onPress={() => setConfirm({ message: "Close the vote now? The book with the most votes wins.", title: "Close it", run: () => api.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "close" }) })} />
          <Button title="Cancel vote" variant="ghost" disabled={busy} onPress={() => setConfirm({ message: "Cancel this vote? The books put up and the votes cast so far are dropped.", title: "Cancel it", run: () => api.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "cancel" }) })} />
        </View>
      )}
      {!confirm?.at && confirmBox}
      {error && <Notice tone="error" message={error} />}

      {nominating && (
        <NominateSheet taken={nominations} busy={busy} onClose={() => setNominating(false)}
          onPick={(bookId) => act(() => api.post(`/api/clubs/${clubId}/votes/${vote.id}/nominations`, { bookId }), "Couldn't put that book up.", () => setNominating(false))} />
      )}
    </View>
  );
}

// A book from the reader's shelf, searched by title or author.
function NominateSheet({ taken, busy, onClose, onPick }: { taken: ClubNomination[]; busy: boolean; onClose: () => void; onPick: (bookId: string) => void }) {
  const { colors, radii } = useTheme();
  const { data: books } = useBooks();
  const [query, setQuery] = useState("");
  const shelf = useMemo(() => (books ?? []).filter((b) => NOMINABLE.has(b.status)), [books]);
  const q = query.trim().toLowerCase();
  const matches = (q ? shelf.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) : shelf).slice(0, 50);
  const isTaken = (b: { title: string; author: string }) => taken.some((n) => n.title.toLowerCase() === b.title.toLowerCase() && n.author.toLowerCase() === b.author.toLowerCase());

  return (
    <Sheet title="Put a book up" onClose={busy ? () => {} : onClose}>
      <View style={{ gap: 8 }}>
        <TextField label="Search your shelf" value={query} onChangeText={setQuery} autoComplete="off" autoCorrect={false} />
        {books && shelf.length === 0 && <Text variant="muted">Nothing on your shelf yet. Add the book you want to put up, then come back.</Text>}
        {matches.map((b) => (
          <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${b.title} by ${b.author}`} disabled={busy || isTaken(b)} onPress={() => onPick(b.id)}
            style={({ pressed }) => [styles.pick, { borderRadius: radii.md, backgroundColor: pressed ? colors.muted : "transparent", opacity: isTaken(b) ? 0.6 : 1 }]}>
            <BookCover book={b} width={40} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2}>{b.title}</Text>
              <Text variant="small" numberOfLines={1}>{b.author}{isTaken(b) ? " · already up" : ""}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 12, borderWidth: 1, alignItems: "flex-start" },
  pick: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
