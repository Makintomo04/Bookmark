import { useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import useSWR from "swr";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Crown, Download, Trash2 } from "lucide-react-native";
import { FEATURE_COPY, isUpgradeRequired } from "@bookmark/shared/entitlements";
import { DEFAULT_COLOUR } from "@bookmark/shared/profile";
import { MOODS, MOOD_LABEL } from "@bookmark/shared/workTags";
import {
  COMPARE_PRESETS,
  COMPARE_PRESET_LABEL,
  EXPLORER_CHART_LABEL,
  EXPLORER_FORMATS,
  FORMAT_LABEL,
  NO_FILTERS,
  RANGE_PRESETS,
  RANGE_PRESET_LABEL,
  REREAD_CHOICES,
  REREAD_LABEL,
  SAVED_VIEW_NAME_MAX,
  SPICE_LEVELS,
  chartFileName,
  compareRange,
  explorerSearch,
  hasFilters,
  parseExplorerQuery,
  presetRange,
  rangeCardTitle,
  type ComparePreset,
  type DateRange,
  type ExplorerChart,
  type ExplorerFilters,
  type ExplorerPeriod,
  type ExplorerQuery,
  type ExplorerResult,
  type SavedStatView,
} from "@bookmark/shared/statsExplorer";
import { CARD_KINDS, CARD_KIND_LABEL, CARD_SIZES, cardFileName, cardPath, type CardKind } from "@bookmark/shared/wrapCards";
import { ShareImageSheet } from "@/components/share/ShareImageSheet";
import { ColumnChart, RankedBars, type Datum } from "@/components/stats/Charts";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DateField } from "@/components/ui/DateField";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { ApiError, api, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { webUrl } from "@/lib/config";
import { useTheme } from "@/lib/theme";

// The stats explorer (BOO-82, Plus; the web's /stats/explore): any dates, a second period beside them,
// filters, saved views, a CSV of any chart and a Wrap card for the dates. The server works every number
// out and refuses a free account with a 402, which shows the upgrade prompt here. Every stat on the
// stats screen stays free.

const fmt = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const sameRange = (a: DateRange | null, b: DateRange | null) => !!a && !!b && a.from === b.from && a.to === b.to;
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
const CHARTS: ExplorerChart[] = ["timeline", "formats", "genres", "authors", "moods", "spice", "ratings"];

type CompareMode = "none" | ComparePreset | "custom";
type Response = ExplorerResult & { today: string; timeZone: string };

function compareModeOf(query: ExplorerQuery): CompareMode {
  if (!query.compare) return "none";
  return COMPARE_PRESETS.find((p) => sameRange(compareRange(p, query.range), query.compare)) ?? "custom";
}

export default function StatsExplore() {
  const { colors } = useTheme();
  // The stats screen loaded this already; its accent colours the charts here too.
  const accent = useSWR<{ accent: string | null }>("/api/stats").data?.accent || DEFAULT_COLOUR;
  // Null until the server has said what today is: the first load opens on this year.
  const [query, setQuery] = useState<ExplorerQuery | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const key = `/api/stats/explore${query ? `?${explorerSearch(query)}` : ""}`;
  const { data, error, isLoading } = useSWR<Response>(key, { keepPreviousData: true });
  const views = useSWR<{ views: SavedStatView[] }>(data ? "/api/stats/views" : null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  if (error instanceof ApiError && isUpgradeRequired(error.body)) {
    return (
      <Screen>
        <View style={[styles.upsell, { borderColor: colors.border }]}>
          <Crown size={22} color={colors.brand} />
          <Text variant="title">{FEATURE_COPY.statsExplorer.title}</Text>
          <Text variant="muted">{FEATURE_COPY.statsExplorer.message}</Text>
          <Button title="See Bookmark Plus" onPress={() => router.push("/plus")} />
        </View>
        <Text variant="small" style={{ textAlign: "center" }}>Your stats screen, your Wrapped and every monthly and yearly card stay free.</Text>
      </Screen>
    );
  }
  if (!data && isLoading) return <Screen><ActivityIndicator color={colors.mutedForeground} /></Screen>;
  if (!data) return <Screen><Notice tone="error" message={error instanceof ApiError ? error.message : "We couldn't load the explorer. Try again in a moment."} /></Screen>;

  const current = query ?? data.query;
  const { period, compare, options } = data;
  const filters = current.filters;
  const today = data.today;

  const setRange = (range: DateRange) => setQuery({ ...current, range, compare: compareMode === "none" ? null : compareMode === "custom" ? current.compare : compareRange(compareMode, range) });
  const setCompare = (mode: CompareMode) => {
    setCompareMode(mode);
    setQuery({ ...current, compare: mode === "none" ? null : mode === "custom" ? current.compare ?? compareRange("lastYear", current.range) : compareRange(mode, current.range) });
  };
  const setFilters = (patch: Partial<ExplorerFilters>) => setQuery({ ...current, filters: { ...current.filters, ...patch } });
  const applyView = (view: SavedStatView) => {
    const parsed = parseExplorerQuery(new URLSearchParams(view.query), today);
    if (!parsed.ok) return;
    setCompareMode(compareModeOf(parsed.query));
    setQuery(parsed.query);
  };

  const saveView = async () => {
    setSaving(true);
    setViewError(null);
    try {
      const body = await api.post<{ views: SavedStatView[] }>("/api/stats/views", { name: viewName, query: explorerSearch(current) });
      await views.mutate(body, { revalidate: false });
      setViewName("");
    } catch (e) {
      setViewError(e instanceof Error ? e.message : "That view couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };
  const deleteView = async (id: string) => {
    const body = await api.delete<{ views: SavedStatView[] }>(`/api/stats/views/${id}`).catch(() => null);
    if (body) await views.mutate(body, { revalidate: false });
  };

  // A CSV of one chart, through the share sheet (Files, Numbers, Sheets, email).
  const shareCsv = async (chart: ExplorerChart) => {
    setCsvError(null);
    try {
      const res = await apiFetch(`/api/stats/explore?${explorerSearch(current)}&csv=${chart}`);
      if (!res.ok) throw new Error("We couldn't make that CSV. Try again in a moment.");
      const name = chartFileName(chart, current.range);
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
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: `Save ${EXPLORER_CHART_LABEL[chart].toLowerCase()} as CSV`, UTI: "public.comma-separated-values-text" });
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : "We couldn't make that CSV.");
    }
  };

  const activePreset = RANGE_PRESETS.find((p) => sameRange(presetRange(p, today), current.range));

  return (
    <Screen edges={["left", "right"]}>
      <Text variant="display">Explore your stats</Text>

      {views.data && views.data.views.length > 0 && (
        <Group label="Saved views">
          {views.data.views.map((v) => (
            <View key={v.id} style={styles.viewRow}>
              <Chip label={v.name} selected={v.query === explorerSearch(current)} onPress={() => applyView(v)} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete the view ${v.name}`} hitSlop={8} onPress={() => deleteView(v.id)}>
                <Trash2 size={15} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </Group>
      )}

      <View style={[styles.section, { borderColor: colors.border }]}>
        <Group label="Dates">
          {RANGE_PRESETS.map((p) => <Chip key={p} label={RANGE_PRESET_LABEL[p]} selected={p === activePreset} onPress={() => setRange(presetRange(p, today))} />)}
        </Group>
        <DateField label="From" value={current.range.from} onChange={(day) => day && day <= current.range.to && setRange({ ...current.range, from: day })} />
        <DateField label="To" value={current.range.to} onChange={(day) => day && day >= current.range.from && setRange({ ...current.range, to: day })} />
        <Group label="Compare with">
          <Chip label="Nothing" selected={compareMode === "none"} onPress={() => setCompare("none")} />
          {COMPARE_PRESETS.map((p) => <Chip key={p} label={COMPARE_PRESET_LABEL[p]} selected={compareMode === p} onPress={() => setCompare(p)} />)}
          <Chip label="Dates of my own" selected={compareMode === "custom"} onPress={() => setCompare("custom")} />
        </Group>
        {compareMode === "custom" && current.compare && (
          <>
            <DateField label="Compare from" value={current.compare.from} onChange={(day) => day && current.compare && day <= current.compare.to && setQuery({ ...current, compare: { ...current.compare, from: day } })} />
            <DateField label="Compare to" value={current.compare.to} onChange={(day) => day && current.compare && day >= current.compare.from && setQuery({ ...current, compare: { ...current.compare, to: day } })} />
          </>
        )}

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(!showFilters)} hitSlop={6}>
          <Text variant="label" style={{ color: colors.brandText }}>{showFilters ? "Hide filters" : hasFilters(filters) ? "Filters (on)" : "Filters"}</Text>
        </Pressable>
        {showFilters && (
          <View style={{ gap: 14 }}>
            <Group label="Format">{EXPLORER_FORMATS.map((f) => <Chip key={f} label={FORMAT_LABEL[f]} selected={filters.formats.includes(f)} onPress={() => setFilters({ formats: toggle(filters.formats, f) })} />)}</Group>
            <Group label="Reads">{REREAD_CHOICES.map((r) => <Chip key={r} label={REREAD_LABEL[r]} selected={filters.rereads === r} onPress={() => setFilters({ rereads: r })} />)}</Group>
            <Group label="Spice">{SPICE_LEVELS.map((s) => <Chip key={s} label={String(s)} accessibilityLabel={`Spice ${s}`} selected={filters.spice.includes(s)} onPress={() => setFilters({ spice: toggle(filters.spice, s).sort((a, b) => a - b) })} />)}</Group>
            <Group label="Mood">{MOODS.map((m) => <Chip key={m} label={MOOD_LABEL[m]} selected={filters.moods.includes(m)} onPress={() => setFilters({ moods: toggle(filters.moods, m) })} />)}</Group>
            <ScrollGroup label="Genre" options={options.genres} chosen={filters.genres} onChange={(genres) => setFilters({ genres })} />
            <ScrollGroup label="Author" options={options.authors} chosen={filters.authors} onChange={(authors) => setFilters({ authors })} />
            {hasFilters(filters) && <Button title="Clear filters" variant="outline" onPress={() => setFilters(NO_FILTERS)} />}
          </View>
        )}

        <TextField label="Save this view as" value={viewName} onChangeText={setViewName} maxLength={SAVED_VIEW_NAME_MAX} placeholder="Audiobooks this year" error={viewError} />
        <Button title="Save view" variant="outline" loading={saving} disabled={!viewName.trim()} onPress={saveView} />
      </View>

      {error ? <Notice tone="error" message={error instanceof ApiError ? error.message : "We couldn't work that out. Try again in a moment."} /> : null}
      {csvError ? <Notice tone="error" message={csvError} /> : null}

      <View style={{ gap: 4, opacity: isLoading ? 0.6 : 1 }}>
        <Text variant="title">{period.label}</Text>
        {compare && <Text variant="muted">Against {compare.label}</Text>}
      </View>

      <View style={styles.tiles}>
        <Tile label="Books read" value={fmt(period.books)} then={compare && fmt(compare.books)} />
        <Tile label="Pages read" value={fmt(period.pages)} then={compare && fmt(compare.pages)} />
        <Tile label="Hours listened" value={fmt(Math.round(period.minutes / 60))} then={compare && fmt(Math.round(compare.minutes / 60))} />
        <Tile label="Re-reads" value={fmt(period.rereads)} then={compare && fmt(compare.rereads)} />
        <Tile label="Did not finish" value={period.dnfRate === null ? "–" : `${Math.round(period.dnfRate * 100)}%`} then={compare && (compare.dnfRate === null ? "–" : `${Math.round(compare.dnfRate * 100)}%`)} />
        <Tile label="Average rating" value={period.averageRating ? `${period.averageRating} ★` : "–"} then={compare && (compare.averageRating ? `${compare.averageRating} ★` : "–")} />
      </View>

      {CHARTS.map((chart) => (
        <View key={chart} style={[styles.section, { borderColor: colors.border }]}>
          <View style={styles.line}>
            <Text variant="title">{EXPLORER_CHART_LABEL[chart]}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Share ${EXPLORER_CHART_LABEL[chart].toLowerCase()} as CSV`} hitSlop={8} onPress={() => shareCsv(chart)} style={styles.csv}>
              <Download size={14} color={colors.mutedForeground} />
              <Text variant="small">CSV</Text>
            </Pressable>
          </View>
          <ChartFor chart={chart} period={period} accent={accent} heading={compare ? period.label : undefined} />
          {compare && <ChartFor chart={chart} period={compare} accent={colors.mutedForeground} heading={compare.label} />}
        </View>
      ))}

      <RangeCard range={current.range} label={period.label} accent={accent} />

      <Text variant="small" style={{ textAlign: "center" }}>
        Counted from the same reads as your stats screen{options.undated ? `; ${plural(options.undated, "finish", "finishes")} without a date can't fall in any range` : ""}.
        {data.timeZone !== "UTC" ? ` Days follow ${data.timeZone} time.` : ""}
      </Text>
    </Screen>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{label}</Text>
      <View accessibilityLabel={label} style={styles.chips}>{children}</View>
    </View>
  );
}

// Genres and authors can run to hundreds: one scrolling row, chosen ones first.
function ScrollGroup({ label, options, chosen, onChange }: { label: string; options: string[]; chosen: string[]; onChange: (next: string[]) => void }) {
  if (!options.length) return null;
  const rest = options.filter((o) => !chosen.includes(o));
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel={label}>
        {[...chosen, ...rest].map((o) => <Chip key={o} label={o} selected={chosen.includes(o)} onPress={() => onChange(toggle(chosen, o))} />)}
      </ScrollView>
    </View>
  );
}

function ChartFor({ chart, period, accent, heading }: { chart: ExplorerChart; period: ExplorerPeriod; accent: string; heading?: string }) {
  const body = (() => {
    if (period.finishes === 0) return <Text variant="muted">No finished books here.</Text>;
    // The bars count reads (a re-read finishes again), so they say "reads"; ratings count each book once.
    if (chart === "timeline") {
      const data: Datum[] = period.timeline.map((t) => ({ label: t.label, value: t.books, detail: `${plural(t.books, "read")} · ${plural(t.pages, "page")}` }));
      return <ColumnChart data={data} accent={accent} label={`Reads finished, ${period.label}`} />;
    }
    if (chart === "spice" || chart === "ratings") {
      const data: Datum[] = period[chart].map((t) => ({ label: chart === "ratings" ? `${t.name}★` : t.name, name: chart === "ratings" ? `${t.name} ${t.name === "1" ? "star" : "stars"}` : `Spice ${t.name}`, value: t.count, detail: plural(t.count, chart === "ratings" ? "book" : "read") }));
      return <ColumnChart data={data} accent={accent} label={`${EXPLORER_CHART_LABEL[chart]}, ${period.label}`} />;
    }
    const rows = period[chart].filter((t) => t.count > 0);
    if (!rows.length) return <Text variant="muted">{chart === "moods" ? "Tag a mood on a book you finished and it shows up here." : "Nothing to count here yet."}</Text>;
    return <RankedBars data={rows.map((t) => ({ label: t.name, value: t.count, detail: plural(t.count, "read") }))} accent={accent} label={`${EXPLORER_CHART_LABEL[chart]}, ${period.label}`} />;
  })();
  return (
    <View style={{ gap: 8 }}>
      {heading ? <Text variant="muted">{heading}</Text> : null}
      {body}
    </View>
  );
}

function Tile({ label, value, then }: { label: string; value: string; then?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { borderColor: colors.border }]} accessible accessibilityLabel={`${label}: ${value}${then ? `, ${then} before` : ""}`}>
      <Text variant="muted">{label}</Text>
      <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
      {then ? <Text variant="small">{then} before</Text> : null}
    </View>
  );
}

// A Wrap card for the explorer's dates, through the same share sheet as the stats screen's cards.
function RangeCard({ range, label, accent }: { range: DateRange; label: string; accent: string }) {
  const { colors } = useTheme();
  const username = useAuth((s) => s.user?.username ?? null);
  const [kind, setKind] = useState<CardKind>("grid");
  const [open, setOpen] = useState(false);
  const size = "story" as const;
  const { width, height } = CARD_SIZES[size];
  const profileUrl = username ? webUrl(`/u/${encodeURIComponent(username)}`) : webUrl("/");
  const title = rangeCardTitle(range);
  return (
    <View style={[styles.box, { backgroundColor: colors.muted, borderLeftColor: accent }]}>
      <Text variant="label">A Wrap card for these dates</Text>
      <Text variant="muted">Every cover you finished in {label}, or your numbers. Private books are left out, and so are the filters.</Text>
      <View style={styles.chips}>{CARD_KINDS.map((k) => <Chip key={k} label={CARD_KIND_LABEL[k]} selected={k === kind} onPress={() => setKind(k)} />)}</View>
      <Button title="Make my card" onPress={() => setOpen(true)} />
      {open && (
        <ShareImageSheet
          onClose={() => setOpen(false)}
          image={{
            title,
            imagePath: cardPath({ kind, size, design: "midnight", range }),
            fileName: cardFileName({ kind, size, range }),
            aspect: width / height,
            hasRatings: true,
            link: { label: "Share the link to your profile", url: profileUrl, message: `${title} ${profileUrl}` },
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  upsell: { borderWidth: 1, borderStyle: "dashed", borderRadius: 16, padding: 20, gap: 10 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  csv: { flexDirection: "row", alignItems: "center", gap: 4 },
  box: { gap: 12, padding: 16, borderRadius: 12, borderLeftWidth: 3 },
});
