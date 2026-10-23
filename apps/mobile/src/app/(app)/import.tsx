import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import { BookCheck, CalendarOff, Check, CopyX, ExternalLink, FileUp, HelpCircle, Search, Sparkles } from "lucide-react-native";
import { Medal } from "@/components/achievements/Medal";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api, apiFetch } from "@/lib/api";
import { refreshAfterBookChange } from "@/lib/books";
import { useTheme } from "@/lib/theme";

// Import (the web's /import): a Goodreads, StoryGraph or Bookmark CSV goes up, the server matches it on
// Open Library one step at a time while this screen drives it, the reader checks a preview, then the
// books are added. Leaving pauses the import; coming back carries on.

const MAX_BYTES = 5 * 1024 * 1024;

type Status = "COMPLETED" | "STARTED" | "NOT_STARTED" | "PAUSED" | "DNF" | "NOT_INTERESTED";
const SHELVES: { status: Status; label: string }[] = [
  { status: "COMPLETED", label: "Finished" },
  { status: "STARTED", label: "Reading" },
  { status: "NOT_STARTED", label: "Want to read" },
  { status: "PAUSED", label: "Paused" },
  { status: "DNF", label: "Did not finish" },
  { status: "NOT_INTERESTED", label: "Will not read" },
];
const SOURCE_LABEL: Record<string, string> = { goodreads: "Goodreads", storygraph: "StoryGraph", bookmark: "Bookmark" };
const FORMAT_LABEL: Record<string, string> = { AUDIOBOOK: "Audiobook", EBOOK: "Ebook", HARDCOVER: "Hardcover", PAPERBACK: "Paperback" };

const fmt = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Candidate = { workKey: string; title: string | null; authors: string[]; year: number | null; coverUrl: string | null; pages: number | null; subjects: string[] };
type UncertainRow = { index: number; title: string; author: string; year: number | null; format: string | null; pick: Candidate; confidence: number; others: Candidate[] };
type FileNotes = {
  quarantined: { line: number; detail?: string | null }[];
  dateOrderGuessed: boolean;
  dayFirst: boolean;
  unreadableDateCount: number;
  unreadableDates: { value: string; line: number }[];
};
type ImportResult = {
  created: number;
  duplicates: number;
  firstYear: number | null;
  lastYear: number | null;
  medals: { key: string; title: string }[];
  unmatched: { bookId: string; title: string; author: string }[];
  undatedFinished: number;
  file?: FileNotes | null;
};
type Job = {
  id: string;
  source: string;
  fileName: string | null;
  status: "matching" | "ready" | "importing" | "done" | "cancelled";
  total: number;
  looked: number;
  toImport: number;
  matched: number;
  unmatched: number;
  byStatus: Partial<Record<Status, number>>;
  duplicates: { shelf: number; file: number };
  samples: { unmatched: string[]; duplicates: string[] };
  imported: number;
  result: ImportResult | null;
  coversToCheck: number;
  checking: number;
  uncertain: UncertainRow[];
  undatedFinished: number;
  notes: FileNotes | null;
};

const step = (id: string, body: Record<string, unknown>) => api.post<Job | null>(`/api/import/${id}`, body);
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export default function Import() {
  const { colors } = useTheme();
  const [job, setJob] = useState<Job | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  // Repeats one step until the job leaves `whileStatus`. Network blips are retried a few times; a 4xx stops.
  const drive = useCallback(async (start: Job, action: "match" | "import", whileStatus: Job["status"]) => {
    const run = ++runId.current;
    let current = start;
    let failures = 0;
    setError(null);
    while (current.status === whileStatus && runId.current === run) {
      try {
        const next = await step(current.id, { action });
        if (!next || runId.current !== run) return;
        current = next;
        failures = 0;
        setJob(next);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if ((status === 0 || status >= 500 || status === 429) && ++failures <= 4) {
          await pause(1500 * failures);
          continue;
        }
        setError(message(err, "Something went wrong. Try again."));
        return;
      }
    }
    if (current.status === "done") refreshAfterBookChange();
  }, []);

  // Pick up an import already under way (the app was closed, or it was started on the web).
  useEffect(() => {
    api.get<Job | null>("/api/import")
      .then((existing) => {
        setJob(existing);
        if (existing?.status === "matching") void drive(existing, "match", "matching");
        if (existing?.status === "importing") void drive(existing, "import", "importing");
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    return () => { runId.current++; };
  }, [drive]);

  const upload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain"], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    if (file.size && file.size > MAX_BYTES) {
      setError("That file is over 5 MB. Export just your books as a CSV, not a full data archive.");
      return;
    }
    setError(null);
    const form = new FormData();
    if (Platform.OS === "web" && file.file) form.append("file", file.file, file.name);
    // React Native's FormData takes a file by its uri.
    else form.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "text/csv" } as unknown as Blob);
    try {
      const res = await apiFetch("/api/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body);
      const created = body as Job;
      setJob(created);
      if (created.status === "matching") void drive(created, "match", "matching");
    } catch (err) {
      setError(message(err, "Couldn't read that file."));
    }
  };

  const confirm = async () => {
    if (!job) return;
    try {
      const started = await step(job.id, { action: "start" });
      if (!started) return;
      setJob(started);
      void drive(started, "import", "importing");
    } catch (err) {
      setError(message(err, "Couldn't start the import."));
    }
  };

  const startOver = async () => {
    runId.current++;
    if (job && job.status !== "done") await api.delete(`/api/import/${job.id}`).catch(() => undefined);
    setJob(null);
    setError(null);
  };

  const resume = () => {
    if (job?.status === "matching") void drive(job, "match", "matching");
    if (job?.status === "importing") void drive(job, "import", "importing");
  };

  if (!loaded) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;

  return (
    <Screen edges={["left", "right"]}>
      {error && (
        <View style={{ gap: 8 }}>
          <Notice tone="error" message={error} />
          {(job?.status === "matching" || job?.status === "importing") && <Button title="Carry on" variant="outline" onPress={resume} />}
        </View>
      )}
      {!job || job.status === "cancelled" ? <UploadStep onPick={upload} />
        : job.status === "matching" ? (
          job.checking > 0 && job.looked >= job.total
            ? <ProgressStep title="Checking the unsure ones" detail={`${plural(job.checking, "title")} left to check against Open Library's suggestions`} value={job.total - job.checking} max={job.total} job={job} />
            : <ProgressStep title="Matching your books" detail={`Looking up ${fmt(job.looked)} of ${fmt(job.total)} on Open Library`} value={job.looked} max={job.total} job={job} />
        )
        : job.status === "ready" ? <PreviewStep job={job} onConfirm={confirm} onCancel={startOver} onChange={setJob} />
        : job.status === "importing" ? <ProgressStep title="Adding books to your shelves" detail={`${fmt(Math.min(job.imported, job.total))} of ${fmt(job.total)}`} value={job.imported} max={job.total} />
        : <SummaryStep job={job} onChange={setJob} onAnother={startOver} />}
    </Screen>
  );
}

// ---- Upload ------------------------------------------------------------------------------

const HOW_TO: { source: string; steps: string; href?: string }[] = [
  { source: "Goodreads", steps: "My Books → Import and export → Export library. The CSV arrives a minute or so later.", href: "https://www.goodreads.com/review/import" },
  { source: "StoryGraph", steps: "Your profile → Manage account → Export StoryGraph library.", href: "https://app.thestorygraph.com/user-export" },
  { source: "Bookmark", steps: "An export from Bookmark itself (More → Your data → Export books) imports exactly as it left." },
];

function UploadStep({ onPick }: { onPick: () => Promise<void> }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const take = async () => {
    if (busy) return;
    setBusy(true);
    try { await onPick(); } finally { setBusy(false); }
  };

  return (
    <>
      <View style={{ gap: 10 }}>
        <Text variant="display">Bring your library with you</Text>
        <Text variant="muted">
          Bring your shelves, star ratings, reviews and every reading date from Goodreads or StoryGraph.
          You'll see a preview before anything is added, and your data leaves whenever you do.
        </Text>
      </View>

      <View style={[styles.drop, { borderColor: colors.input }]}>
        {busy ? <ActivityIndicator size="large" color={colors.mutedForeground} /> : <FileUp size={36} color={colors.mutedForeground} />}
        <View style={{ alignItems: "center" }}>
          <Text variant="label">{busy ? "Reading your file…" : "Choose your export"}</Text>
          <Text variant="muted">A .csv file, up to 5 MB</Text>
        </View>
        <Button title="Choose file" disabled={busy} onPress={() => void take()} />
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="small" style={{ letterSpacing: 1, fontWeight: "600" }}>WHERE TO FIND YOUR EXPORT</Text>
        {HOW_TO.map((h) => (
          <View key={h.source} style={[styles.box, { borderColor: colors.border }]}>
            <Text variant="label">{h.source}</Text>
            <Text variant="muted">{h.steps}</Text>
            {h.href && (
              <View style={{ alignItems: "flex-start" }}>
                <Button
                  title={`Open ${h.source} export`}
                  variant="outline"
                  icon={<ExternalLink size={14} color={colors.foreground} />}
                  onPress={() => void WebBrowser.openBrowserAsync(h.href!)}
                />
              </View>
            )}
          </View>
        ))}
      </View>
    </>
  );
}

// ---- Progress ----------------------------------------------------------------------------

function ProgressBar({ value, max }: { value: number; max: number }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={[styles.track, { backgroundColor: colors.muted }]}>
      <View style={[styles.track, { width: `${pct}%`, backgroundColor: colors.brandFill }]} />
    </View>
  );
}

function ProgressStep({ title, detail, value, max, job }: { title: string; detail: string; value: number; max: number; job?: Job }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 16, paddingVertical: 16 }} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <ActivityIndicator color={colors.mutedForeground} />
        <Text variant="display" style={{ flex: 1 }}>{title}</Text>
      </View>
      <ProgressBar value={value} max={max} />
      <Text variant="muted">{detail}</Text>
      {job && job.looked > 0 && (
        <Text>{plural(job.matched, "match", "matches")} so far{job.unmatched > 0 ? `, ${fmt(job.unmatched)} to check later` : ""}.</Text>
      )}
      <Text variant="small">Keep Bookmark open while this runs. Leaving pauses the import; come back to carry on.</Text>
    </View>
  );
}

// ---- Preview -----------------------------------------------------------------------------

function Note({ icon, children, detail }: { icon: ReactNode; children: ReactNode; detail?: string }) {
  return (
    <View style={styles.note}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text>{children}</Text>
        {detail ? <Text variant="muted">{detail}</Text> : null}
      </View>
    </View>
  );
}

// What the pre-cleaner set aside or had to decide, and the finishes it left undated. Shown before and after.
function FileNotesList({ notes, undatedFinished }: { notes: FileNotes | null; undatedFinished: number }) {
  const { colors } = useTheme();
  const icon = (Icon: typeof HelpCircle) => <Icon size={18} color={colors.mutedForeground} />;
  const items: ReactNode[] = [];
  if (undatedFinished > 0) {
    items.push(
      <Note key="undated" icon={icon(CalendarOff)} detail="They're kept as finished with the date left blank rather than dated today, so your stats stay honest. Add a date from the book's page whenever you like.">
        {plural(undatedFinished, "finished book has", "finished books have")} no finish date in your file.
      </Note>,
    );
  }
  if (notes?.quarantined.length) {
    const lines = notes.quarantined.slice(0, 6).map((q) => `row ${fmt(q.line)}${q.detail ? ` (${q.detail})` : ""}`).join("; ");
    items.push(
      <Note key="quarantined" icon={icon(HelpCircle)} detail={`${lines}${notes.quarantined.length > 6 ? "…" : ""}. Everything else in the file came through.`}>
        {plural(notes.quarantined.length, "row has", "rows have")} no title and {notes.quarantined.length === 1 ? "was" : "were"} set aside.
      </Note>,
    );
  }
  if (notes?.dateOrderGuessed) {
    items.push(
      <Note key="order" icon={icon(HelpCircle)} detail="Nothing in the file settled which way round they are. If yours are month/day, re-export from the app rather than a spreadsheet.">
        Dates like 03/04/2024 were read as day/month{notes.dayFirst ? "" : " and month/day"}.
      </Note>,
    );
  }
  if (notes?.unreadableDateCount) {
    const examples = notes.unreadableDates.slice(0, 4).map((d) => `"${d.value}" (row ${fmt(d.line)})`).join(", ");
    items.push(
      <Note key="unreadable" icon={icon(HelpCircle)} detail={`${examples}${notes.unreadableDateCount > 4 ? "…" : ""}.`}>
        {plural(notes.unreadableDateCount, "date")} couldn't be read and {notes.unreadableDateCount === 1 ? "was" : "were"} left blank.
      </Note>,
    );
  }
  return items.length ? <View style={{ gap: 12 }}>{items}</View> : null;
}

function PreviewStep({ job, onConfirm, onCancel, onChange }: { job: Job; onConfirm: () => Promise<void>; onCancel: () => void; onChange: (job: Job) => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const duplicates = job.duplicates.shelf + job.duplicates.file;
  const unsure = job.uncertain.length;

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 4 }}>
        <Text variant="muted">{SOURCE_LABEL[job.source] ?? job.source} export{job.fileName ? ` · ${job.fileName}` : ""}</Text>
        <Text variant="display">Ready to import {plural(job.toImport, "book")}</Text>
      </View>

      <View style={styles.stats}>
        {SHELVES.map((s) => (
          <View key={s.status} style={[styles.stat, { borderColor: colors.border }]}>
            <Text style={{ fontSize: 22, fontWeight: "700" }}>{fmt(job.byStatus[s.status] ?? 0)}</Text>
            <Text variant="muted">{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 12 }}>
        <Note icon={<BookCheck size={18} color="#16a34a" />}>
          <Text style={{ fontWeight: "700" }}>{fmt(job.matched)}</Text> matched on Open Library, with covers and work details.
        </Note>
        {unsure > 0 && (
          <Note icon={<Sparkles size={18} color="#d97706" />}>
            <Text style={{ fontWeight: "700" }}>{fmt(unsure)}</Text> {unsure === 1 ? "match" : "matches"} to check below. Any you don't check {unsure === 1 ? "is" : "are"} added as typed.
          </Note>
        )}
        {job.unmatched > 0 && (
          <Note icon={<Search size={18} color="#d97706" />} detail={job.samples.unmatched.length ? `${job.samples.unmatched.join("; ")}${job.unmatched > job.samples.unmatched.length ? "…" : ""}` : undefined}>
            <Text style={{ fontWeight: "700" }}>{fmt(job.unmatched)}</Text> without a match. They're still imported, and you can match them afterwards.
          </Note>
        )}
        {duplicates > 0 && (
          <Note icon={<CopyX size={18} color={colors.mutedForeground} />} detail={job.samples.duplicates.length ? `${job.samples.duplicates.join("; ")}${duplicates > job.samples.duplicates.length ? "…" : ""}` : undefined}>
            <Text style={{ fontWeight: "700" }}>{fmt(duplicates)}</Text> skipped as already on your shelf{job.duplicates.file > 0 ? " or listed twice" : ""}.
          </Note>
        )}
      </View>

      <FileNotesList notes={job.notes} undatedFinished={job.undatedFinished} />

      {unsure > 0 && <ReviewList job={job} onChange={onChange} />}

      <Text variant="muted">Imported books won't appear in your followers' feeds, and only books you finished this year count toward this year's goal.</Text>

      <View style={{ gap: 10 }}>
        <Button
          title={`Import ${plural(job.toImport, "book")}`}
          loading={busy}
          disabled={job.toImport === 0}
          onPress={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
        />
        <Button title="Choose a different file" variant="outline" onPress={onCancel} />
      </View>
    </View>
  );
}

// ---- Review ------------------------------------------------------------------------------

// Matches the matcher wasn't sure of: one tap each, before anything is filed. Unchecked rows import as typed.
function ReviewList({ job, onChange }: { job: Job; onChange: (job: Job) => void }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(8);
  const rows = job.uncertain;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="title">{plural(rows.length, "match", "matches")} to check</Text>
        <Text variant="muted">Open Library wasn't sure about these. Confirm the suggestion, pick another, or add the book as it is in your file.</Text>
      </View>
      <View style={[styles.list, { borderColor: colors.border }]}>
        {rows.slice(0, shown).map((row, i) => (
          <View key={row.index} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            <ReviewRow jobId={job.id} row={row} onChange={onChange} />
          </View>
        ))}
      </View>
      {rows.length > shown && <Button title="Show more" variant="ghost" onPress={() => setShown((n) => n + 20)} />}
    </View>
  );
}

function CoverThumb({ url, width = 56 }: { url: string | null; width?: number }) {
  const { colors } = useTheme();
  const style = { width, height: width * 1.43, borderRadius: 4, backgroundColor: colors.muted };
  return url ? <Image source={{ uri: url.replace(/-L\.jpg$/, "-M.jpg") }} style={style} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={style} />;
}

function ReviewRow({ jobId, row, onChange }: { jobId: string; row: UncertainRow; onChange: (job: Job) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const yours = [row.author, row.year, row.format && FORMAT_LABEL[row.format]].filter(Boolean).join(" · ");
  const theirs = [row.pick.authors.slice(0, 2).join(", "), row.pick.year].filter(Boolean).join(" · ");

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      const next = await step(jobId, { action: "decide", index: row.index, ...body });
      if (next) onChange(next);
    } catch (err) {
      setFailed(message(err, "Couldn't save that. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ padding: 12, gap: 12 }}>
      <View style={styles.row}>
        <CoverThumb url={row.pick.coverUrl} />
        <View style={{ flex: 1, gap: 8 }}>
          <View>
            <Text variant="small" style={{ letterSpacing: 1 }}>IN YOUR FILE</Text>
            <Text variant="label">{row.title}</Text>
            {yours ? <Text variant="muted">{yours}</Text> : null}
          </View>
          <View>
            <Text variant="small" style={{ letterSpacing: 1 }}>BEST GUESS · {Math.round(row.confidence * 100)}% SURE</Text>
            <Text variant="label">{row.pick.title ?? "Untitled"}</Text>
            {theirs ? <Text variant="muted">{theirs}</Text> : null}
          </View>
        </View>
      </View>
      {failed && <Notice tone="error" message={failed} />}
      <View style={styles.actions}>
        <Button title="That's right" disabled={busy} onPress={() => void send({ choice: "accept" })} />
        <Button title="Pick another" variant="outline" disabled={busy} onPress={() => setOpen((o) => !o)} accessibilityState={{ expanded: open }} />
        <Button title="Add as typed" variant="ghost" disabled={busy} onPress={() => void send({ choice: "typed" })} />
      </View>
      {open && <WorkSearch initialQuery={`${row.title} ${row.author === "Unknown" ? "" : row.author}`.trim()} others={row.others} busy={busy} onPick={(c) => void send({ choice: "pick", candidate: c })} />}
    </View>
  );
}

type SearchResult = { workKey: string | null; title: string; author: string; pages: number | null; coverUrl: string | null; year?: number | null };

const asCandidate = (c: SearchResult): Candidate => ({
  workKey: c.workKey!,
  title: c.title,
  authors: c.author ? [c.author] : [],
  year: c.year ?? null,
  coverUrl: c.coverUrl,
  pages: c.pages,
  subjects: [],
});

// Other works to choose from: what the search already found for the row, then an Open Library search box.
function WorkSearch({ initialQuery, others = [], busy, onPick }: { initialQuery: string; others?: Candidate[]; busy: boolean; onPick: (c: Candidate) => void }) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) return;
    setSearching(true);
    setSearchFailed(false);
    try {
      const found = await api.get<SearchResult[]>(`/api/books/search?q=${encodeURIComponent(q.trim())}`);
      setResults(found.filter((c) => c.workKey).map(asCandidate));
    } catch {
      setResults(null);
      setSearchFailed(true);
    } finally {
      setSearching(false);
    }
  }, []);

  // With nothing to offer up front, search for the row's own title straight away.
  useEffect(() => {
    if (others.length === 0) void search(initialQuery);
    // Once, when the box opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The row's own candidates first; search results fill in behind them, without repeats.
  const shown = [...others, ...(results ?? []).filter((r) => !others.some((o) => o.workKey === r.workKey))];

  return (
    <View style={{ gap: 10 }}>
      <TextField label="Search Open Library" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => void search(query)} autoCorrect={false} />
      <Button title="Search" variant="outline" loading={searching} disabled={busy} onPress={() => void search(query)} />
      {searchFailed && <Notice tone="error" message="The search didn't go through. Try again." />}
      {results && results.length === 0 && shown.length === 0 && <Text variant="muted">No results. Try a shorter title.</Text>}
      {shown.map((c) => (
        <Pressable
          key={c.workKey}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onPick(c)}
          style={({ pressed }) => [styles.candidate, { borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent", opacity: busy ? 0.5 : 1 }]}
        >
          <CoverThumb url={c.coverUrl} width={40} />
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1}>{c.title ?? "Untitled"}</Text>
            <Text variant="small" numberOfLines={1}>
              {c.authors.slice(0, 2).join(", ")}{c.year ? ` · ${c.year}` : ""}{c.pages ? ` · ${fmt(c.pages)} pages` : ""}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ---- Summary -----------------------------------------------------------------------------

function SummaryStep({ job, onChange, onAnother }: { job: Job; onChange: (job: Job) => void; onAnother: () => void }) {
  const { colors } = useTheme();
  const result = job.result!;
  const years = result.firstYear !== null && result.lastYear !== null ? result.lastYear - result.firstYear + 1 : 0;
  const headline = [
    plural(result.created, "book"),
    years > 1 ? plural(years, "year") : null,
    result.medals.length > 0 ? `${plural(result.medals.length, "medal")} earned` : null,
  ].filter(Boolean).join(", ");

  useCovers(job, onChange);

  return (
    <View style={{ gap: 24 }}>
      <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
        <View style={[styles.done, { backgroundColor: "rgba(22,163,74,0.15)" }]}><Check size={28} color="#16a34a" /></View>
        <Text variant="display" style={{ textAlign: "center" }}>{headline}</Text>
        <Text variant="muted" style={{ textAlign: "center" }}>
          Welcome home.{result.duplicates > 0 ? ` ${plural(result.duplicates, "book")} already on your shelf ${result.duplicates === 1 ? "was" : "were"} left as ${result.duplicates === 1 ? "it was" : "they were"}.` : ""}
        </Text>
        <Button title="Go to my shelves" onPress={() => router.navigate("/")} />
      </View>

      {result.medals.length > 0 && (
        <View style={{ gap: 14 }}>
          <Text variant="title">Medals your history earned</Text>
          <View style={styles.medals}>
            {result.medals.map((m) => (
              <View key={m.key} style={styles.medal}>
                <Medal achievementKey={m.key.split(":")[0]} earned size={60} />
                <Text variant="small" style={{ textAlign: "center", color: colors.foreground }}>{m.title}</Text>
              </View>
            ))}
          </View>
          <Button title="See all achievements" variant="ghost" onPress={() => router.push("/achievements")} />
        </View>
      )}

      <FileNotesList notes={result.file ?? null} undatedFinished={result.undatedFinished} />

      {result.unmatched.length > 0 && <UnmatchedList job={job} onChange={onChange} />}

      {job.coversToCheck > 0 && (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text variant="small" style={{ flex: 1 }}>Saving copies of your covers. If you leave now, the rest keep loading from Open Library.</Text>
        </View>
      )}

      <Button title="Import another file" variant="outline" onPress={onAnother} />
    </View>
  );
}

// Copies covers a few at a time while the summary is open. Leaving is fine: the rest stay hotlinked.
function useCovers(job: Job, onChange: (job: Job) => void) {
  const pending = job.coversToCheck > 0;
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    void (async () => {
      let failures = 0;
      while (alive) {
        try {
          const next = await step(job.id, { action: "covers" });
          if (!alive || !next) return;
          latest.current(next);
          if (next.coversToCheck === 0) return;
          failures = 0;
        } catch {
          if (++failures > 3) return;
          await pause(3000 * failures);
        }
      }
    })();
    return () => { alive = false; };
  }, [job.id, pending]);
}

function UnmatchedList({ job, onChange }: { job: Job; onChange: (job: Job) => void }) {
  const { colors } = useTheme();
  const unmatched = job.result!.unmatched;
  const [shown, setShown] = useState(10);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="title">{plural(unmatched.length, "book")} without a match</Text>
        <Text variant="muted">They're on your shelves as you entered them. Find a match to add a cover, or keep them as they are.</Text>
      </View>
      <View style={[styles.list, { borderColor: colors.border }]}>
        {unmatched.slice(0, shown).map((u, i) => (
          <View key={u.bookId} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            <UnmatchedRow jobId={job.id} entry={u} onChange={onChange} />
          </View>
        ))}
      </View>
      {unmatched.length > shown && <Button title="Show more" variant="ghost" onPress={() => setShown((n) => n + 20)} />}
    </View>
  );
}

function UnmatchedRow({ jobId, entry, onChange }: { jobId: string; entry: { bookId: string; title: string; author: string }; onChange: (job: Job) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      const next = await step(jobId, { bookId: entry.bookId, ...body });
      if (next) onChange(next);
      refreshAfterBookChange();
    } catch (err) {
      setFailed(message(err, "Couldn't save that. Try again."));
      setBusy(false);
    }
  };

  return (
    <View style={{ padding: 12, gap: 10 }}>
      <View>
        <Text variant="label">{entry.title}</Text>
        <Text variant="muted">{entry.author}</Text>
      </View>
      {failed && <Notice tone="error" message={failed} />}
      <View style={styles.actions}>
        <Button title="Find match" variant="outline" disabled={busy} onPress={() => setOpen((o) => !o)} accessibilityState={{ expanded: open }} />
        <Button title="Keep as is" variant="ghost" disabled={busy} onPress={() => void send({ action: "keep" })} />
      </View>
      {open && (
        <WorkSearch
          initialQuery={`${entry.title} ${entry.author === "Unknown" ? "" : entry.author}`.trim()}
          busy={busy}
          onPick={(c) => void send({ action: "fix", workKey: c.workKey, coverUrl: c.coverUrl, pages: c.pages })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { borderWidth: 2, borderStyle: "dashed", borderRadius: 16, padding: 28, alignItems: "center", gap: 14 },
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  note: { flexDirection: "row", gap: 12 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { flexBasis: "30%", flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
  list: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  actions: { gap: 8 },
  candidate: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 10, padding: 8 },
  done: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  medals: { flexDirection: "row", flexWrap: "wrap", rowGap: 18 },
  medal: { width: "33.3%", alignItems: "center", gap: 8, paddingHorizontal: 4 },
});
