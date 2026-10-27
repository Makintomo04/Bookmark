"use client"
import { FC, useState } from 'react'
import { ChevronDown, Flame, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import {
  MOODS, MOOD_LABEL, MOODS_MAX, SPICE_HINT, SPICE_LABEL, SPICE_LEVELS, SPICE_MAX, SPICE_MIN_REPORTS, WARNING_LEVELS,
  WARNING_LEVEL_LABEL, WARNING_TOPICS, shownMoods,
  type ContentWarning, type Mood, type ReaderTagsInput, type SpiceLevel, type TagAggregate, type WarningLevel, type WarningTopic,
} from '@/lib/workTags'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

const levelClass: Record<WarningLevel, string> = {
  MINOR: "bg-neutral-100 dark:bg-neutral-800 text-foreground",
  MODERATE: "bg-amber-100 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100",
  GRAPHIC: "bg-rose-100 dark:bg-rose-900/40 text-rose-950 dark:text-rose-100",
}

// ---- Reading the aggregate ------------------------------------------------------------------

// "emotional · tense · dark": the moods most readers gave a book, strongest first.
export const MoodChips: FC<{ moods: TagAggregate["moods"], readers: number, className?: string }> = ({ moods, readers, className }) => {
  if (moods.length === 0) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Moods">
      {shownMoods(moods, readers, 6).map(({ mood, count }) => (
        <li
          key={mood}
          title={`${plural(count, "reader")} of ${readers}`}
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 h-7 text-xs font-medium"
        >
          {MOOD_LABEL[mood]}
          {readers > 1 && <span className="text-muted-foreground tabular-nums">{Math.round((count / readers) * 100)}%</span>}
        </li>
      ))}
    </ul>
  )
}

// Collapsed behind a tap by default: a reader who wants to go in blind shouldn't have to look away.
export const ContentWarnings: FC<{ warnings: TagAggregate["warnings"], readers: number, className?: string }> = ({ warnings, readers, className }) => {
  const [open, setOpen] = useState(false)
  if (warnings.length === 0) return null
  const graphic = warnings.filter((w) => w.level === "GRAPHIC").length
  return (
    <div className={cn("rounded-xl border border-neutral-200 dark:border-neutral-800", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ShieldAlert size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="flex-1">
          <span className="font-medium">{plural(warnings.length, "content warning")}</span>
          <span className="text-muted-foreground">{graphic > 0 ? ` · ${graphic} graphic` : ""} · from {plural(readers, "reader")}</span>
        </span>
        <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-3">
          {warnings.map((w) => (
            <li key={w.topic} title={`${plural(w.count, "reader")}: ${WARNING_LEVEL_LABEL[w.level]}`} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-xs font-medium", levelClass[w.level])}>
              {w.topic}
              <span className="opacity-70">{WARNING_LEVEL_LABEL[w.level]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Five flames, `level` of them lit. Decorative: the words beside it say the level.
export const SpiceFlames: FC<{ level: SpiceLevel, size?: number, className?: string }> = ({ level, size = 14, className }) => (
  <span aria-hidden className={cn("inline-flex gap-0.5", className)}>
    {Array.from({ length: SPICE_MAX }, (_, i) => (
      <Flame key={i} size={size} className={i < level ? "fill-current text-foreground" : "text-neutral-300 dark:text-neutral-700"} />
    ))}
  </span>
)

// "Spice 3 of 5 · steamy": readers' median, once enough have reported it; before that, when it will
// show. Deliberately no reader count: the level is what a reader is after.
export const SpiceLine: FC<{ spice: TagAggregate["spice"] | undefined, className?: string }> = ({ spice, className }) => {
  if (!spice || spice.reports === 0) return null
  if (spice.level === null) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Flame size={16} aria-hidden className="shrink-0" />
        Spice shows once {SPICE_MIN_REPORTS} readers have reported it
      </p>
    )
  }
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", className)} title={SPICE_HINT[spice.level]}>
      <SpiceFlames level={spice.level} size={16} />
      <span>
        <span className="font-medium">Spice {spice.level} of {SPICE_MAX}</span>
        <span className="text-muted-foreground"> · {SPICE_LABEL[spice.level]}</span>
      </span>
    </p>
  )
}

// Moods, spice and warnings together, for a book page. Renders nothing until someone has tagged the book.
export const WorkTagsSummary: FC<{ tags: TagAggregate | undefined, className?: string }> = ({ tags, className }) => {
  if (!tags || tags.readers === 0) return null
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <MoodChips moods={tags.moods} readers={tags.readers} />
      {tags.spiceApplies && <SpiceLine spice={tags.spice} />}
      <ContentWarnings warnings={tags.warnings} readers={tags.readers} />
    </div>
  )
}

// ---- Tagging at review time -----------------------------------------------------------------

interface ReaderTagsEditorProps {
  value: ReaderTagsInput
  onChange: (next: ReaderTagsInput) => void
  disabled?: boolean
  accent?: string
  // Spice is only asked of a reader who finished a book it applies to (spiceAskable in lib/workTags.ts).
  canReportSpice?: boolean
}

export const EMPTY_TAGS: ReaderTagsInput = { moods: [], warnings: [], spice: null }
const tagsKey = (t: ReaderTagsInput) =>
  JSON.stringify({ m: [...t.moods].sort(), w: [...t.warnings].sort((x, y) => x.topic.localeCompare(y.topic)), s: t.spice ?? null })
export const sameTags = (a: ReaderTagsInput, b: ReaderTagsInput) => tagsKey(a) === tagsKey(b)

const chipBase = "inline-flex items-center h-8 px-3 rounded-full text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"

export const ReaderTagsEditor: FC<ReaderTagsEditorProps> = ({ value, onChange, disabled, accent, canReportSpice }) => {
  const [adding, setAdding] = useState(false)
  const [topic, setTopic] = useState<WarningTopic | "">("")
  const [level, setLevel] = useState<WarningLevel>("MODERATE")
  const taken = new Set(value.warnings.map((w) => w.topic))

  const toggleMood = (mood: Mood) => {
    const has = value.moods.includes(mood)
    if (!has && value.moods.length >= MOODS_MAX) return
    onChange({ ...value, moods: has ? value.moods.filter((m) => m !== mood) : [...value.moods, mood] })
  }

  const addWarning = () => {
    if (!topic) return
    const next: ContentWarning = { topic, level }
    onChange({ ...value, warnings: [...value.warnings.filter((w) => w.topic !== topic), next] })
    setTopic("")
    setAdding(false)
  }

  const removeWarning = (t: WarningTopic) => onChange({ ...value, warnings: value.warnings.filter((w) => w.topic !== t) })

  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="flex flex-col gap-7">
      {/* A legend sits outside its fieldset's flex flow, so gap doesn't reach it: it needs its own margin. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          How did it feel? <span className="font-normal text-muted-foreground">· optional, up to {MOODS_MAX}</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((mood) => {
            const on = value.moods.includes(mood)
            return (
              <button
                key={mood}
                type="button"
                aria-pressed={on}
                disabled={disabled || (!on && value.moods.length >= MOODS_MAX)}
                onClick={() => toggleMood(mood)}
                style={on && accent ? { background: accent, borderColor: accent, color: readableInk(accent) } : undefined}
                className={cn(chipBase, "border", on ? "border-foreground bg-foreground text-background" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900")}
              >
                {MOOD_LABEL[mood]}
              </button>
            )
          })}
        </div>
      </fieldset>

      {canReportSpice && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            How spicy was it? <span className="font-normal text-muted-foreground">· optional</span>
          </legend>
          <p className="mb-1 text-sm text-muted-foreground">
            A book shows the middle answer once {SPICE_MIN_REPORTS} readers have given one. Tap your answer again to clear it.
          </p>
          <div role="radiogroup" aria-label="Spice level" className="flex flex-wrap gap-1.5">
            {SPICE_LEVELS.map((n) => {
              const on = value.spice === n
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${n}, ${SPICE_LABEL[n]}: ${SPICE_HINT[n]}`}
                  title={SPICE_HINT[n]}
                  disabled={disabled}
                  onClick={() => onChange({ ...value, spice: on ? null : n })}
                  style={on && accent ? { background: accent, borderColor: accent, color: readableInk(accent) } : undefined}
                  className={cn(chipBase, "gap-1.5 border tabular-nums", on ? "border-foreground bg-foreground text-background" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900")}
                >
                  <span className="font-medium">{n}</span> {SPICE_LABEL[n]}
                </button>
              )
            })}
          </div>
          {value.spice != null && <p className="text-sm text-muted-foreground" aria-live="polite">{SPICE_HINT[value.spice as SpiceLevel]}</p>}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Content warnings <span className="font-normal text-muted-foreground">· optional</span>
        </legend>
        <p className="mb-1 text-sm text-muted-foreground">Other readers see these collapsed, so nobody gets more than they asked for.</p>
        {value.warnings.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {value.warnings.map((w) => (
              <li key={w.topic}>
                <button
                  type="button"
                  onClick={() => removeWarning(w.topic)}
                  disabled={disabled}
                  aria-label={`Remove ${w.topic} (${WARNING_LEVEL_LABEL[w.level]})`}
                  className={cn(chipBase, "gap-1.5 h-7 text-xs font-medium", levelClass[w.level])}
                >
                  {w.topic} <span className="opacity-70">{WARNING_LEVEL_LABEL[w.level]}</span> <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="warning-topic" className="sr-only">Topic</label>
            <select id="warning-topic" value={topic} onChange={(e) => setTopic(e.target.value as WarningTopic)} disabled={disabled} className={cn(selectClass, "min-w-0 flex-1")}>
              <option value="">Choose a topic</option>
              {WARNING_TOPICS.filter((t) => !taken.has(t)).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label htmlFor="warning-level" className="sr-only">Level</label>
            <select id="warning-level" value={level} onChange={(e) => setLevel(e.target.value as WarningLevel)} disabled={disabled} className={selectClass}>
              {WARNING_LEVELS.map((l) => <option key={l} value={l}>{WARNING_LEVEL_LABEL[l]}</option>)}
            </select>
            <button type="button" onClick={addWarning} disabled={disabled || !topic} className={cn(chipBase, "border border-foreground font-medium")}>Add</button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} disabled={disabled} className="w-fit text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground">
            + Add a content warning
          </button>
        )}
      </fieldset>
    </div>
  )
}
