import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import useSWR from "swr";
import { BookOpen, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react-native";
import { formatPercent } from "@bookmark/shared/buddyReads";
import { FEATURE_COPY, isUpgradeRequired } from "@bookmark/shared/entitlements";
import { AiLabel } from "@/components/ui/AiLabel";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { ApiError, api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

// "Catch me up" on the book page, as on the web (components/books/CatchMeUp.tsx): a short AI recap of
// the story so far, or of the earlier books in a series. A prompt card when the reader is coming back
// to the book, otherwise one quiet action. Nothing when recaps are off or the book can't be recapped.

// On every recap, whatever its kind.
const RECAP_LABEL = "Written by AI from what's known about this book. May be imperfect. Only you see this.";

type RecapKind = "RESUME" | "SERIES";
type RecapVote = "UP" | "DOWN";
type StoredRecap = { id: string; kind: RecapKind; bucket: number; confident: boolean; paragraphs: string[]; vote: RecapVote | null };
type ResumeOption = { kind: "RESUME"; prompt: boolean; reason: "paused" | "idle" | null; percent: number; bound: number };
type SeriesOption = { kind: "SERIES"; prompt: boolean; seriesName: string; position: number; books: { workId: string; title: string; position: number }[]; bound: number };
type AllowanceStatus = { allowance: number | null; used: number; left: number | null; isPlus: boolean; dailyLeft: number };
type Option<T> = (T & { recap: StoredRecap | null }) | null;

type RecapState =
  | { enabled: false }
  | { enabled: true; available: boolean; resume: Option<ResumeOption>; series: Option<SeriesOption>; allowance: AllowanceStatus };

type Panel =
  | { kind: "idle" }
  | { kind: "loading"; recapKind: RecapKind }
  | { kind: "recap"; recapKind: RecapKind; recap: StoredRecap }
  | { kind: "notConfident" }
  | { kind: "upgrade" }
  | { kind: "error"; message: string };

const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const seriesBooksText = (s: SeriesOption) => {
  const positions = s.books.map((b) => b.position);
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (positions.length > 2 && contiguous) return `books ${positions[0]} to ${positions[positions.length - 1]}`;
  return `${positions.length === 1 ? "book" : "books"} ${listJoin(positions.map(String))}`;
};

const promptText = (resume: ResumeOption | null, series: SeriesOption | null) => {
  if (resume?.prompt) {
    const lead = resume.reason === "paused" ? "Picking this back up?" : "Been a little while?";
    return `${lead} Get a short recap of the story up to ${formatPercent(resume.bound)}, with nothing from further on.`;
  }
  if (series?.prompt) return `Starting book ${series.position} of ${series.seriesName}? Get a recap of ${seriesBooksText(series)}, which you've finished, and nothing from this one.`;
  return "";
};

const allowanceText = (a: AllowanceStatus) =>
  a.left === null ? null
    : a.isPlus ? `${a.left} of ${a.allowance} recaps left this month (fair use)`
    : `${a.left} of ${a.allowance} free recaps left this month`;

export function CatchMeUp({ bookId }: { bookId: string }) {
  const { colors } = useTheme();
  const key = `/api/books/${bookId}/recap`;
  const { data, mutate } = useSWR<RecapState>(key);
  const [view, setView] = useState<Panel>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const [vote, setVote] = useState<RecapVote | null>(null);

  if (!data || !data.enabled) return null;
  const { resume, series, available, allowance } = data;
  if (!resume && !series) return null;

  const show = (recapKind: RecapKind, recap: StoredRecap) => {
    setVote(recap.vote);
    setView({ kind: "recap", recapKind, recap });
  };

  const ask = async (recapKind: RecapKind) => {
    const kept = recapKind === "RESUME" ? resume?.recap : series?.recap;
    if (kept) {
      if (kept.confident) show(recapKind, kept);
      else setView({ kind: "notConfident" });
      return;
    }
    setView({ kind: "loading", recapKind });
    try {
      const res = await api.post<{ status: string; recap: StoredRecap }>(key, { kind: recapKind });
      if (res.status === "ready") show(recapKind, res.recap);
      else setView({ kind: "notConfident" });
      void mutate();
    } catch (err) {
      const body = err instanceof ApiError ? err.body : null;
      if (isUpgradeRequired(body)) setView({ kind: "upgrade" });
      else setView({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't write a recap right now. Try again in a minute." });
    }
  };

  const sendVote = (next: RecapVote) => {
    if (view.kind !== "recap") return;
    const value = vote === next ? null : next;
    const before = vote;
    setVote(value);
    api.patch(key, { recapId: view.recap.id, vote: value }).then(() => mutate(), () => setVote(before));
  };

  const actions: { kind: RecapKind; label: string }[] = [];
  if (resume) actions.push({ kind: "RESUME", label: resume.recap?.confident ? "Show my recap" : "Catch me up" });
  if (series) actions.push({ kind: "SERIES", label: series.recap?.confident ? `Show recap of ${seriesBooksText(series)}` : `Recap ${seriesBooksText(series)}` });
  // The prompt leads with the kind that triggered it.
  if (!resume?.prompt && series?.prompt) actions.reverse();

  const prompting = !dismissed && !!(resume?.prompt || series?.prompt);
  const busy = view.kind === "loading";
  const left = allowanceText(allowance);

  const buttons = available && view.kind !== "recap" && view.kind !== "upgrade" && (
    <View style={styles.buttons}>
      {actions.map((a, i) => (
        <Button
          key={a.kind}
          title={a.label}
          variant={i === 0 && prompting ? "primary" : "outline"}
          disabled={busy}
          icon={i === 0 ? (prompting ? <Sparkles size={16} color={colors.onBrand} /> : <BookOpen size={16} color={colors.foreground} />) : undefined}
          onPress={() => void ask(a.kind)}
        />
      ))}
    </View>
  );
  const unavailable = !available && <Text variant="small">Recaps aren't available right now.</Text>;

  const body = (() => {
    switch (view.kind) {
      case "loading":
        return (
          <View style={styles.row} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.mutedForeground} />
            <Text variant="muted">Writing a recap{view.recapKind === "RESUME" && resume ? ` up to ${formatPercent(resume.bound)}` : ""}…</Text>
          </View>
        );
      case "recap":
        return (
          <View style={{ gap: 12 }} accessibilityLabel="Recap">
            <View style={[styles.row, { flexWrap: "wrap" }]}>
              <AiLabel />
              <Text variant="small" style={{ flex: 1 }}>{RECAP_LABEL}</Text>
            </View>
            {view.recapKind === "RESUME" && <Text variant="label" style={{ fontSize: 12 }}>The story up to {formatPercent(view.recap.bucket)}</Text>}
            {view.recapKind === "SERIES" && series && <Text variant="label" style={{ fontSize: 12 }}>{series.seriesName}: {listJoin(series.books.map((b) => b.title))}</Text>}
            <View style={{ gap: 10 }}>
              {view.recap.paragraphs.map((p, i) => <Text key={i} style={{ fontSize: 15, lineHeight: 23 }}>{p}</Text>)}
            </View>
            <View style={styles.row}>
              <Text variant="small">Was this accurate?</Text>
              <VoteButton label="Accurate" pressed={vote === "UP"} onPress={() => sendVote("UP")} Icon={ThumbsUp} />
              <VoteButton label="Not accurate" pressed={vote === "DOWN"} onPress={() => sendVote("DOWN")} Icon={ThumbsDown} />
              <View style={{ flex: 1 }} />
              <Button title="Hide" variant="ghost" onPress={() => setView({ kind: "idle" })} />
            </View>
          </View>
        );
      case "notConfident":
        return <Text variant="muted">We can't recap this one reliably, so we won't guess. That didn't count towards your recaps.</Text>;
      case "upgrade":
        // The Plus screen comes later in the port; until then, the same words as the web's upgrade prompt.
        return (
          <View style={{ gap: 4 }}>
            <Text variant="label">{FEATURE_COPY.recaps.title}</Text>
            <Text variant="muted">{FEATURE_COPY.recaps.message}</Text>
          </View>
        );
      case "error":
        return <Text variant="muted" accessibilityRole="alert">{view.message}</Text>;
      default:
        return null;
    }
  })();

  if (prompting && view.kind === "idle") {
    return (
      <View accessibilityLabel="Catch me up" style={[styles.card, { borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={() => setDismissed(true)} hitSlop={8} style={styles.close}>
          <X size={18} color={colors.mutedForeground} />
        </Pressable>
        <View style={[styles.row, { alignItems: "flex-start", paddingRight: 28 }]}>
          <View style={[styles.badge, { backgroundColor: colors.muted }]}><Sparkles size={16} color={colors.brandText} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">Catch me up</Text>
            <Text variant="muted">{promptText(resume, series)}</Text>
          </View>
        </View>
        {buttons}
        {unavailable}
        {available && left && <Text variant="small">{left}. Opening a recap again is free.</Text>}
      </View>
    );
  }

  const boxed = view.kind !== "idle" && view.kind !== "upgrade";
  return (
    <View accessibilityLabel="Catch me up" style={[{ gap: 12 }, boxed && [styles.card, { borderColor: colors.border }]]}>
      {view.kind === "idle" ? buttons : body}
      {view.kind !== "idle" && view.kind !== "recap" && view.kind !== "loading" && buttons}
      {view.kind === "idle" && unavailable}
    </View>
  );
}

function VoteButton({ label, pressed, onPress, Icon }: { label: string; pressed: boolean; onPress: () => void; Icon: typeof ThumbsUp }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: pressed }}
      onPress={onPress}
      style={[styles.vote, { borderRadius: radii.md, borderColor: colors.border }, pressed && { backgroundColor: colors.foreground, borderColor: colors.foreground }]}
    >
      <Icon size={15} color={pressed ? colors.background : colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  close: { position: "absolute", right: 10, top: 10, zIndex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  buttons: { gap: 8 },
  vote: { width: 36, height: 36, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
