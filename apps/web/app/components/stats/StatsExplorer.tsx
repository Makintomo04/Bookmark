"use client"
import { FC, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, BookOpenText, Download, ExternalLink, Headphones, Repeat, Ruler, Star, Trash2, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ColumnChart, Datum, RankedBars } from './Charts'
import { MOODS, MOOD_LABEL, type Mood } from '@bookmark/shared/workTags'
import {
  COMPARE_PRESETS,
  COMPARE_PRESET_LABEL,
  EXPLORER_CHART_LABEL,
  EXPLORER_FORMATS,
  FORMAT_LABEL,
  RANGE_PRESETS,
  RANGE_PRESET_LABEL,
  REREAD_CHOICES,
  REREAD_LABEL,
  SAVED_VIEW_NAME_MAX,
  SPICE_LEVELS,
  compareRange,
  explorerSearch,
  hasFilters,
  isDay,
  presetRange,
  type ComparePreset,
  type DateRange,
  type ExplorerChart,
  type ExplorerFilters,
  type ExplorerPeriod,
  type ExplorerQuery,
  type ExplorerResult,
  type RangePreset,
  type SavedStatView,
} from '@bookmark/shared/statsExplorer'
import { CARD_DESIGNS, CARD_DESIGN_KEYS, CARD_KINDS, CARD_KIND_LABEL, CARD_SIZES, CARD_SIZE_KEYS, cardFileName, cardPath, type CardDesign, type CardKind, type CardSize } from '@bookmark/shared/wrapCards'

const fmt = (n: number) => n.toLocaleString('en-GB')
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`
const button = 'inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
const outline = 'border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
const field = 'h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const sameRange = (a: DateRange | null, b: DateRange | null) => !!a && !!b && a.from === b.from && a.to === b.to

type CompareMode = 'none' | ComparePreset | 'custom'

// Which comparison a query's second range is: one of the presets worked out from its first, or its own dates.
function compareModeOf(query: ExplorerQuery): CompareMode {
  if (!query.compare) return 'none'
  return COMPARE_PRESETS.find((p) => sameRange(compareRange(p, query.range), query.compare)) ?? 'custom'
}

const Chip: FC<{ pressed: boolean; onClick: () => void; children: ReactNode; label?: string }> = ({ pressed, onClick, children, label }) => (
  <button
    type="button"
    aria-pressed={pressed}
    aria-label={label}
    onClick={onClick}
    className={cn(
      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      pressed ? 'border-foreground bg-foreground text-background' : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
    )}
  >
    {children}
  </button>
)

const Group: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-sm font-medium">{label}</span>
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">{children}</div>
  </div>
)

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

// A genre or author filter: the chosen ones as chips, and a picker for the rest.
const PickList: FC<{ label: string; options: string[]; chosen: string[]; onChange: (next: string[]) => void }> = ({ label, options, chosen, onChange }) => {
  const rest = options.filter((o) => !chosen.some((c) => c.toLocaleLowerCase() === o.toLocaleLowerCase()))
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`pick-${label}`} className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((c) => (
          <Chip key={c} pressed onClick={() => onChange(chosen.filter((x) => x !== c))} label={`Remove ${c}`}>
            {c} <X size={12} aria-hidden />
          </Chip>
        ))}
        <select
          id={`pick-${label}`}
          value=""
          disabled={rest.length === 0}
          onChange={(e) => e.target.value && onChange([...chosen, e.target.value])}
          className={cn(field, 'max-w-[14rem]')}
        >
          <option value="">{chosen.length ? 'Add another…' : `Any ${label.toLowerCase()}`}</option>
          {rest.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  )
}

// The difference from the compared period, as "+3" or "−12%".
function delta(now: number | null, then: number | null, kind: 'count' | 'percent' | 'stars' = 'count') {
  if (now === null || then === null) return null
  const d = now - then
  if (kind === 'percent') {
    const points = Math.round(d * 100)
    return points === 0 ? 'no change' : `${points > 0 ? '+' : '−'}${Math.abs(points)} points`
  }
  if (kind === 'stars') {
    const r = Math.round(d * 100) / 100
    return r === 0 ? 'no change' : `${r > 0 ? '+' : '−'}${Math.abs(r)} ★`
  }
  return d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`
}

const Tile: FC<{ icon: ReactNode; label: string; value: string; then?: string | null; change?: string | null }> = ({ icon, label, value, then, change }) => (
  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-hidden className="text-[color:var(--accent-text)]">{icon}</span>
      {label}
    </div>
    <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
    {then !== undefined && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{then ?? '–'} before{change ? ` · ${change}` : ''}</p>}
  </div>
)

const hours = (minutes: number) => fmt(Math.round(minutes / 60))
const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`)

// One chart for one period, in the shape that suits it.
function ChartFor({ chart, period }: { chart: ExplorerChart; period: ExplorerPeriod }) {
  if (period.finishes === 0) return <p className="text-sm text-muted-foreground">No finished books here.</p>
  if (chart === 'timeline') {
    const data: Datum[] = period.timeline.map((t) => ({ label: t.label, value: t.books, detail: `${plural(t.books, 'book')} · ${plural(t.pages, 'page')}${t.minutes ? ` · ${hours(t.minutes)}h listened` : ''}` }))
    return <ColumnChart data={data} label={`Books finished, ${period.label}`} unit="books" />
  }
  if (chart === 'spice' || chart === 'ratings') {
    const data: Datum[] = period[chart].map((t) => ({ label: chart === 'ratings' ? `${t.name}★` : t.name, name: chart === 'ratings' ? `${t.name} ${t.name === '1' ? 'star' : 'stars'}` : `Spice ${t.name}`, value: t.count, detail: plural(t.count, 'read') }))
    return <ColumnChart data={data} label={`${EXPLORER_CHART_LABEL[chart]}, ${period.label}`} unit="reads" />
  }
  const rows = period[chart].filter((t) => t.count > 0)
  if (!rows.length) return <p className="text-sm text-muted-foreground">{chart === 'moods' ? 'Tag a mood on a book you finished and it shows up here.' : 'Nothing to count here yet.'}</p>
  return <RankedBars data={rows.map((t) => ({ label: t.name, value: t.count, detail: plural(t.count, 'read') }))} label={`${EXPLORER_CHART_LABEL[chart]}, ${period.label}`} unit="reads" />
}

const CHART_ORDER: ExplorerChart[] = ['timeline', 'formats', 'genres', 'authors', 'moods', 'spice', 'ratings']

interface StatsExplorerProps {
  initial: ExplorerResult
  // The reader's own day, which the presets count from.
  today: string
  timeZone: string
  initialViews: SavedStatView[]
  initialError: string | null
}

// The stats explorer (BOO-82, Plus): dates, a comparison and filters at the top, the numbers below, and
// the address keeps up so a view can be bookmarked or saved. Every number here is worked out on the
// server (/api/stats/explore) from the same finishes as /stats.
const StatsExplorer: FC<StatsExplorerProps> = ({ initial, today, timeZone, initialViews, initialError }) => {
  const router = useRouter()
  const [query, setQuery] = useState<ExplorerQuery>(initial.query)
  const [compareMode, setCompareMode] = useState<CompareMode>(() => compareModeOf(initial.query))
  const [result, setResult] = useState<ExplorerResult>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [views, setViews] = useState(initialViews)
  const [viewName, setViewName] = useState('')
  const [viewError, setViewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const search = explorerSearch(query)
  const shown = useRef(explorerSearch(initial.query))

  useEffect(() => {
    if (search === shown.current) return
    let live = true
    setLoading(true)
    router.replace(`/stats/explore?${search}`, { scroll: false })
    fetch(`/api/stats/explore?${search}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? "We couldn't work that out. Try again in a moment.")
        if (!live) return
        shown.current = search
        setResult(body)
        setError(null)
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [search, router])

  const setRange = (range: DateRange) => {
    setQuery((q) => ({ ...q, range, compare: compareMode === 'none' ? null : compareMode === 'custom' ? q.compare : compareRange(compareMode, range) }))
  }
  const setCompare = (mode: CompareMode) => {
    setCompareMode(mode)
    setQuery((q) => ({ ...q, compare: mode === 'none' ? null : mode === 'custom' ? q.compare ?? compareRange('lastYear', q.range) : compareRange(mode, q.range) }))
  }
  const setFilters = (patch: Partial<ExplorerFilters>) => setQuery((q) => ({ ...q, filters: { ...q.filters, ...patch } }))
  const editDay = (which: 'range' | 'compare', end: 'from' | 'to', value: string) => {
    if (!isDay(value)) return
    if (which === 'range') setRange({ ...query.range, [end]: value })
    else setQuery((q) => ({ ...q, compare: { ...(q.compare ?? q.range), [end]: value } }))
  }

  const activePreset = RANGE_PRESETS.find((p) => sameRange(presetRange(p, today), query.range))
  const { period, compare, options } = result
  const filters = query.filters

  const applyView = (view: SavedStatView) => {
    const params = new URLSearchParams(view.query)
    // The server reads it the same way; this only moves the controls.
    const from = params.get('from')
    const to = params.get('to')
    if (!from || !to) return
    const next: ExplorerQuery = {
      range: { from, to },
      compare: params.get('cfrom') && params.get('cto') ? { from: params.get('cfrom')!, to: params.get('cto')! } : null,
      filters: {
        formats: (params.get('format')?.split(',') ?? []) as ExplorerFilters['formats'],
        genres: params.get('genre')?.split('|') ?? [],
        moods: (params.get('mood')?.split(',') ?? []) as Mood[],
        spice: params.get('spice')?.split(',').map(Number) ?? [],
        authors: params.get('author')?.split('|') ?? [],
        rereads: (params.get('reads') as ExplorerFilters['rereads']) ?? 'all',
      },
    }
    setCompareMode(compareModeOf(next))
    setQuery(next)
  }

  const saveView = async () => {
    setSaving(true)
    setViewError(null)
    try {
      const res = await fetch('/api/stats/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: viewName, query: search }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "That view couldn't be saved.")
      setViews(body.views)
      setViewName('')
    } catch (e) {
      setViewError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const deleteView = async (id: string) => {
    const res = await fetch(`/api/stats/views/${id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => null)
    if (res.ok) setViews(body.views)
  }

  const csvHref = (chart: ExplorerChart) => `/api/stats/explore?${search}&csv=${chart}`

  return (
    <div className="space-y-6">
      {views.length > 0 && (
        <section aria-labelledby="saved-views" className="flex flex-wrap items-center gap-2">
          <h2 id="saved-views" className="text-sm font-medium text-muted-foreground">Saved views</h2>
          {views.map((v) => (
            <span key={v.id} className={cn('inline-flex h-8 items-center rounded-full border text-sm', v.query === search ? 'border-foreground' : 'border-neutral-300 dark:border-neutral-700')}>
              <button type="button" onClick={() => applyView(v)} aria-pressed={v.query === search} className="h-full rounded-l-full pl-3 pr-2 hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{v.name}</button>
              <button type="button" onClick={() => deleteView(v.id)} aria-label={`Delete the view ${v.name}`} className="grid h-full place-items-center rounded-r-full pl-1 pr-2.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Trash2 size={13} aria-hidden />
              </button>
            </span>
          ))}
        </section>
      )}

      <section aria-label="What to look at" className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 space-y-5">
        <Group label="Dates">
          {RANGE_PRESETS.map((p: RangePreset) => (
            <Chip key={p} pressed={p === activePreset} onClick={() => setRange(presetRange(p, today))}>{RANGE_PRESET_LABEL[p]}</Chip>
          ))}
        </Group>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">From</span>
            <input type="date" value={query.range.from} min="2000-01-01" max={query.range.to} onChange={(e) => editDay('range', 'from', e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">To</span>
            <input type="date" value={query.range.to} min={query.range.from} onChange={(e) => editDay('range', 'to', e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Compare with</span>
            <select value={compareMode} onChange={(e) => setCompare(e.target.value as CompareMode)} className={field}>
              <option value="none">Nothing</option>
              {COMPARE_PRESETS.map((p) => <option key={p} value={p}>{COMPARE_PRESET_LABEL[p]}</option>)}
              <option value="custom">Dates of my own</option>
            </select>
          </label>
          {compareMode === 'custom' && query.compare && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Compare from</span>
                <input type="date" value={query.compare.from} min="2000-01-01" max={query.compare.to} onChange={(e) => editDay('compare', 'from', e.target.value)} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Compare to</span>
                <input type="date" value={query.compare.to} min={query.compare.from} onChange={(e) => editDay('compare', 'to', e.target.value)} className={field} />
              </label>
            </>
          )}
        </div>

        <details className="group" open={hasFilters(filters)}>
          <summary className="cursor-pointer text-sm font-medium">Filters{hasFilters(filters) ? ' (on)' : ''}</summary>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <Group label="Format">
              {EXPLORER_FORMATS.map((f) => <Chip key={f} pressed={filters.formats.includes(f)} onClick={() => setFilters({ formats: toggle(filters.formats, f) })}>{FORMAT_LABEL[f]}</Chip>)}
            </Group>
            <Group label="Reads">
              {REREAD_CHOICES.map((r) => <Chip key={r} pressed={filters.rereads === r} onClick={() => setFilters({ rereads: r })}>{REREAD_LABEL[r]}</Chip>)}
            </Group>
            <Group label="Spice">
              {SPICE_LEVELS.map((s) => <Chip key={s} pressed={filters.spice.includes(s)} onClick={() => setFilters({ spice: toggle(filters.spice, s).sort((a, b) => a - b) })} label={`Spice ${s}`}>{s}</Chip>)}
            </Group>
            <Group label="Mood">
              {MOODS.map((m) => <Chip key={m} pressed={filters.moods.includes(m)} onClick={() => setFilters({ moods: toggle(filters.moods, m) })}>{MOOD_LABEL[m]}</Chip>)}
            </Group>
            <PickList label="Genre" options={options.genres} chosen={filters.genres} onChange={(genres) => setFilters({ genres })} />
            <PickList label="Author" options={options.authors} chosen={filters.authors} onChange={(authors) => setFilters({ authors })} />
          </div>
          {hasFilters(filters) && (
            <button type="button" onClick={() => setFilters({ formats: [], genres: [], moods: [], spice: [], authors: [], rereads: 'all' })} className="mt-4 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Clear filters
            </button>
          )}
        </details>

        <form
          className="flex flex-wrap items-end gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            saveView()
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Save this view as</span>
            <input value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={SAVED_VIEW_NAME_MAX} placeholder="Audiobooks this year" className={cn(field, 'w-60')} />
          </label>
          <button type="submit" disabled={saving || !viewName.trim()} className={cn(button, outline)}>{saving ? 'Saving…' : 'Save view'}</button>
          {viewError && <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{viewError}</p>}
        </form>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-300 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

      <div aria-live="polite" aria-busy={loading} className={cn('space-y-6 transition-opacity', loading && 'opacity-60')}>
        <div>
          <h2 className="text-xl font-semibold">{period.label}</h2>
          {compare && <p className="text-sm text-muted-foreground">Against {compare.label}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Tile icon={<BookOpen size={16} />} label="Books read" value={fmt(period.books)} then={compare && fmt(compare.books)} change={compare && delta(period.books, compare.books)} />
          <Tile icon={<BookOpenText size={16} />} label="Pages read" value={fmt(period.pages)} then={compare && fmt(compare.pages)} change={compare && delta(period.pages, compare.pages)} />
          <Tile icon={<Headphones size={16} />} label="Hours listened" value={hours(period.minutes)} then={compare && hours(compare.minutes)} change={compare && delta(Math.round(period.minutes / 60), Math.round(compare.minutes / 60))} />
          <Tile icon={<Repeat size={16} />} label="Re-reads" value={fmt(period.rereads)} then={compare && fmt(compare.rereads)} change={compare && delta(period.rereads, compare.rereads)} />
          <Tile icon={<Undo2 size={16} />} label="Did not finish" value={percent(period.dnfRate)} then={compare && percent(compare.dnfRate)} change={compare && delta(period.dnfRate, compare.dnfRate, 'percent')} />
          <Tile icon={<Star size={16} />} label="Average rating" value={period.averageRating ? `${period.averageRating} ★` : '–'} then={compare && (compare.averageRating ? `${compare.averageRating} ★` : null)} change={compare && delta(period.averageRating, compare.averageRating, 'stars')} />
          <Tile icon={<Ruler size={16} />} label="Average length" value={period.averagePages ? fmt(period.averagePages) : '–'} then={compare && (compare.averagePages ? fmt(compare.averagePages) : null)} change={compare && delta(period.averagePages, compare.averagePages)} />
          <Tile icon={<BookOpen size={16} />} label="Finishes" value={fmt(period.finishes)} then={compare && fmt(compare.finishes)} change={compare && delta(period.finishes, compare.finishes)} />
        </div>

        {CHART_ORDER.map((chart) => (
          <section key={chart} aria-labelledby={`chart-${chart}`} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <h2 id={`chart-${chart}`} className="text-lg font-semibold">{EXPLORER_CHART_LABEL[chart]}</h2>
              <a href={csvHref(chart)} download className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <Download size={14} aria-hidden /> CSV<span className="sr-only"> of {EXPLORER_CHART_LABEL[chart].toLowerCase()}</span>
              </a>
            </div>
            <div className={cn('grid gap-6', compare && 'md:grid-cols-2')}>
              <div className="min-w-0">
                {compare && <p className="mb-6 text-sm font-medium">{period.label}</p>}
                <ChartFor chart={chart} period={period} />
              </div>
              {compare && (
                <div className="min-w-0">
                  <p className="mb-6 text-sm font-medium text-muted-foreground">{compare.label}</p>
                  <ChartFor chart={chart} period={compare} />
                </div>
              )}
            </div>
          </section>
        ))}

        <RangeCard range={query.range} label={period.label} books={period.books} />

        <p className="text-center text-xs text-muted-foreground">
          Counted from the same reads as your stats page{options.undated ? `; ${plural(options.undated, 'finish', 'finishes')} without a date can't fall in any range` : ''}.
          {timeZone !== 'UTC' ? ` Days follow ${timeZone} time.` : ''}
        </p>
      </div>
    </div>
  )
}

// A Wrap card for the explorer's dates: the cover grid or the stats card, as /stats makes for a month or
// a year. Filters don't reach a card: it shows the whole range.
const RangeCard: FC<{ range: DateRange; label: string; books: number }> = ({ range, label, books }) => {
  const [kind, setKind] = useState<CardKind>('grid')
  const [size, setSize] = useState<CardSize>('portrait')
  const [design, setDesign] = useState<CardDesign>('midnight')
  const path = useMemo(() => cardPath({ kind, size, design, range }), [kind, size, design, range])
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [path])
  const { width, height } = CARD_SIZES[size]

  return (
    <section aria-labelledby="range-card" className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
      <h2 id="range-card" className="text-lg font-semibold">A Wrap card for these dates</h2>
      <p className="text-sm text-muted-foreground">Every cover you finished in {label}, or your numbers. Private books are left out, and so are the filters.</p>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Group label="Card">{CARD_KINDS.map((k) => <Chip key={k} pressed={k === kind} onClick={() => setKind(k)}>{CARD_KIND_LABEL[k]}</Chip>)}</Group>
          <Group label="Size">{CARD_SIZE_KEYS.map((k) => <Chip key={k} pressed={k === size} onClick={() => setSize(k)}>{`${CARD_SIZES[k].label} · ${CARD_SIZES[k].short}`}</Chip>)}</Group>
          <Group label="Design">{CARD_DESIGN_KEYS.map((k) => <Chip key={k} pressed={k === design} onClick={() => setDesign(k)}>{CARD_DESIGNS[k].label}</Chip>)}</Group>
          <div className="flex flex-wrap gap-2">
            <a href={books ? path : undefined} download={`${cardFileName({ kind, size, range })}.png`} aria-disabled={!books} className={cn(button, 'bg-foreground text-background hover:opacity-90', !books && 'pointer-events-none opacity-50')}>
              <Download size={15} aria-hidden /> Download
            </a>
            <a href={books ? path : undefined} target="_blank" rel="noreferrer" aria-disabled={!books} className={cn(button, outline, !books && 'pointer-events-none opacity-50')}>
              <ExternalLink size={15} aria-hidden /> Open
            </a>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900" style={{ aspectRatio: `${width} / ${height}` }}>
          {books && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element -- drawn by /api/wrap/card for the reader
            <img key={path} src={path} alt={`Your ${CARD_KIND_LABEL[kind].toLowerCase()} card for ${label}`} onError={() => setFailed(true)} className="absolute inset-0 size-full object-contain" />
          ) : (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
              {books ? "We couldn't draw this card. Try again in a moment." : 'No finished books in these dates yet.'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default StatsExplorer
