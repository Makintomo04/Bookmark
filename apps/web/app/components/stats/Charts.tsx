import { FC } from 'react'
import { cn } from '@/lib/utils'

// Hand-rolled HTML/CSS charts: server-rendered, no chart library and no client JS. Marks use the
// reader's accent (var(--accent), see ./accent.ts); text stays in the theme's ink. Hovering a bar
// shows its value, and every chart has a table for screen readers.

export interface Datum {
  label: string
  value: number
  // Shown on hover and in the table, e.g. "4 books · 1,230 pages".
  detail?: string
  // A shorter axis label for narrow screens (months: "J").
  short?: string
  // A fuller name for the tooltip and table, when the axis label is terse ("4½" → "4½ stars").
  name?: string
}

const fmt = (n: number) => n.toLocaleString('en-GB')

// A round number at or above `max`, so the top gridline reads cleanly.
function niceCeiling(max: number) {
  if (max <= 4) return Math.max(1, max)
  const step = Math.pow(10, Math.floor(Math.log10(max)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step
  return 10 * step
}

interface ColumnChartProps {
  data: Datum[]
  // What the chart shows, for the accessible name and the table caption.
  label: string
  unit: string
  className?: string
}

export const ColumnChart: FC<ColumnChartProps> = ({ data, label, unit, className }) => {
  const max = Math.max(0, ...data.map((d) => d.value))
  const top = niceCeiling(max)
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1

  return (
    <figure className={cn('w-full', className)}>
      <div className="flex gap-2">
        {/* Axis: zero, half and the ceiling. */}
        <div aria-hidden className="relative w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground h-40">
          <span className="absolute right-0 top-0 -translate-y-1/2">{fmt(top)}</span>
          {top > 1 && <span className="absolute right-0 top-1/2 -translate-y-1/2">{fmt(top / 2)}</span>}
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>
        <div className="relative flex-1 min-w-0">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-neutral-200 dark:border-neutral-800" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200 dark:border-neutral-800" />
            <div className="absolute inset-x-0 bottom-0 border-t border-neutral-300 dark:border-neutral-700" />
          </div>
          <div aria-hidden className="relative flex h-40 items-end gap-[2px]">
            {data.map((d, i) => {
              const tip = `${d.name ?? d.label}: ${d.detail ?? `${fmt(d.value)} ${unit}`}`
              // Keep the edge tooltips inside the chart (and the page) instead of centring them.
              const anchor = i < data.length / 4 ? "left-0" : i >= (data.length * 3) / 4 ? "right-0" : "left-1/2 -translate-x-1/2"
              return (
                <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center">
                  {i === peak && (
                    <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-foreground" style={{ bottom: `calc(${(d.value / top) * 100}% + 4px)` }}>
                      {fmt(d.value)}
                    </span>
                  )}
                  <div
                    className={cn('w-full max-w-9 rounded-t-[4px] transition-opacity group-hover:opacity-80', d.value > 0 ? 'bg-[var(--accent)]' : 'bg-transparent')}
                    style={{ height: d.value > 0 ? `max(2px, ${(d.value / top) * 100}%)` : 0 }}
                  />
                  <span className={cn("pointer-events-none absolute bottom-full z-10 mb-6 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow group-hover:block", anchor)}>
                    {tip}
                  </span>
                </div>
              )
            })}
          </div>
          <div aria-hidden className="mt-2 flex gap-[2px] text-[11px] text-muted-foreground">
            {data.map((d) => (
              <span key={d.label} className="flex-1 truncate text-center">
                {d.short ? <><span className="sm:hidden">{d.short}</span><span className="hidden sm:inline">{d.label}</span></> : d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <DataTable data={data} label={label} unit={unit} />
    </figure>
  )
}

interface RankedBarsProps {
  data: Datum[]
  label: string
  unit: string
}

// Horizontal bars for ranked lists (genres, authors): the name sits on the bar's own row, so long
// names never collide.
export const RankedBars: FC<RankedBarsProps> = ({ data, label, unit }) => {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <figure>
      <ol aria-label={label} className="space-y-3">
        {data.map((d) => (
          <li key={d.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{d.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{d.detail ?? `${fmt(d.value)} ${unit}`}</span>
            </div>
            <div aria-hidden className="mt-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-900">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  )
}

const DataTable: FC<{ data: Datum[]; label: string; unit: string }> = ({ data, label, unit }) => (
  <table className="sr-only">
    <caption>{label}</caption>
    <tbody>
      {data.map((d) => (
        <tr key={d.label}>
          <th scope="row">{d.name ?? d.label}</th>
          <td>{d.detail ?? `${fmt(d.value)} ${unit}`}</td>
        </tr>
      ))}
    </tbody>
  </table>
)
