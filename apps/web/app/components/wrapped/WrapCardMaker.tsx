"use client"
import { FC, useEffect, useMemo, useState } from 'react'
import { Crown, Download, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import UpgradePrompt from '@/app/components/plus/UpgradePrompt'
import {
  CARD_DESIGNS,
  CARD_DESIGN_KEYS,
  CARD_KINDS,
  CARD_KIND_LABEL,
  CARD_SIZES,
  CARD_SIZE_KEYS,
  DEFAULT_CARD_DESIGN,
  cardFileName,
  cardMonths,
  cardPath,
  cardPeriodKey,
  cardYears,
  type CardDesign,
  type CardKind,
  type CardSize,
} from '@bookmark/shared/wrapCards'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const button = 'inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Period = { year: number; month: number | null; label: string; empty: boolean }

// Every year back to the reader's first finish, newest first, each as the whole year and then its months, in
// the profile's time zone (`today`, packages/shared/src/wrapCards.ts cardToday), as the server counts them.
// A period with no shared finishes (`filled`, cardPeriodKeys) is listed, but can't be picked.
function periods(today: { year: number; month: number }, years: number[], filled: Set<string>): Period[] {
  return cardYears(today, years).flatMap((year) => [
    { year, month: null, label: year === today.year ? `${year} so far` : `All of ${year}`, empty: !filled.has(cardPeriodKey(year, null)) },
    ...cardMonths(year, today).map((month) => ({ year, month, label: `${MONTHS[month - 1]} ${year}`, empty: !filled.has(cardPeriodKey(year, month)) })),
  ])
}

type Preview = { kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'error'; message: string }

// One row of choices, as toggle buttons.
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string; hint?: string; plus?: boolean }[]; onChange: (key: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          title={o.hint}
          onClick={() => onChange(o.key)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            o.key === value ? 'border-foreground bg-foreground text-background' : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
          )}
        >
          {o.label}
          {o.plus && <><Crown size={12} aria-hidden /><span className="sr-only">, Plus</span></>}
        </button>
      ))}
    </div>
  )
}

// Wrap cards on /stats (BOO-50): the cover grid or the stats card for a month or a year, in 9:16, 4:5 or
// 1:1, drawn by /api/wrap/card. Midnight is free; the other designs are Plus.
// `filled`: the periods with shared finishes (lib/stats.ts getCardPeriods), for how far back to offer and which to grey out.
const WrapCardMaker: FC<{ canPickDesigns: boolean; today: { year: number; month: number }; filled: string[] }> = ({ canPickDesigns, today, filled }) => {
  const years = useMemo(() => filled.filter((k) => k.length === 4).map(Number), [filled])
  const options = useMemo(() => periods(today, years, new Set(filled)), [today, years, filled])
  // The latest month with books first, else the latest year with any, else this month.
  const [picked, setPicked] = useState(() => {
    const first = [options.findIndex((o) => o.month !== null && !o.empty), options.findIndex((o) => !o.empty), options.findIndex((o) => o.month !== null)].find((i) => i >= 0)
    return first ?? 0
  })
  const [kind, setKind] = useState<CardKind>('grid')
  const [size, setSize] = useState<CardSize>('story')
  const [design, setDesign] = useState<CardDesign>(DEFAULT_CARD_DESIGN)
  const [hideRatings, setHideRatings] = useState(false)
  const [upsell, setUpsell] = useState(false)
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' })
  const [leftOut, setLeftOut] = useState(0)

  const { year, month, label } = options[picked]
  const path = cardPath({ kind, size, design, year, month, hideRatings })
  const file = `${cardFileName({ kind, size, year, month })}.png`

  // Fetched rather than put straight in an <img>, so a refusal can say why and Download saves this copy.
  useEffect(() => {
    let live = true
    let url: string | null = null
    setPreview({ kind: 'loading' })
    fetch(path)
      .then(async (res) => {
        if (res.status === 404) throw new Error(`No finished books in ${label} yet. Try another month or year.`)
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? "We couldn't draw this card. Try again in a moment.")
        }
        url = URL.createObjectURL(await res.blob())
        if (live) setPreview({ kind: 'ready', url })
      })
      .catch((e: Error) => live && setPreview({ kind: 'error', message: e.message }))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
    // The label only words the message; the path already changes with the period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    let live = true
    fetch(`/api/wrap/left-out?year=${year}${month === null ? '' : `&month=${month}`}`)
      .then((r) => (r.ok ? r.json() : { privateBooks: 0 }))
      .then((d: { privateBooks: number }) => live && setLeftOut(d.privateBooks ?? 0))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [year, month])

  const pickDesign = (key: CardDesign) => {
    if (CARD_DESIGNS[key].plus && !canPickDesigns) {
      setUpsell(true)
      return
    }
    setUpsell(false)
    setDesign(key)
  }

  const { width, height } = CARD_SIZES[size]

  return (
    <section aria-labelledby="wrap-cards" className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
      <h2 id="wrap-cards" className="font-semibold">Wrap cards</h2>
      <p className="text-sm text-muted-foreground">Every cover you finished, or your numbers, sized for TikTok, Reels and Instagram.</p>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wrap-period" className="text-sm font-medium">Period</label>
            <select
              id="wrap-period"
              value={picked}
              onChange={(e) => setPicked(Number(e.target.value))}
              className="h-9 w-full max-w-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {cardYears(today, years).map((y) => (
                <optgroup key={y} label={String(y)}>
                  {options.map((o, i) => (o.year === y ? <option key={o.label} value={i} disabled={o.empty && i !== picked}>{o.empty ? `${o.label} · no books` : o.label}</option> : null))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Card</span>
            <Choice label="Card" value={kind} onChange={setKind} options={CARD_KINDS.map((k) => ({ key: k, label: CARD_KIND_LABEL[k] }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Size</span>
            <Choice label="Size" value={size} onChange={setSize} options={CARD_SIZE_KEYS.map((k) => ({ key: k, label: `${CARD_SIZES[k].label} · ${CARD_SIZES[k].hint}` }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Design</span>
            <Choice label="Design" value={design} onChange={pickDesign} options={CARD_DESIGN_KEYS.map((k) => ({ key: k, label: CARD_DESIGNS[k].label, plus: CARD_DESIGNS[k].plus && !canPickDesigns }))} />
          </div>
          {upsell && <UpgradePrompt feature="customWrapDesigns" />}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideRatings} onChange={(e) => setHideRatings(e.target.checked)} className="size-4 accent-current" />
            Hide my star ratings
          </label>
          {leftOut > 0 && (
            <p className="text-sm text-muted-foreground">
              {leftOut === 1 ? '1 private book is left out of this card.' : `${leftOut.toLocaleString('en-GB')} private books are left out of this card.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={preview.kind === 'ready' ? preview.url : undefined}
              download={file}
              aria-disabled={preview.kind !== 'ready'}
              className={cn(button, 'bg-foreground text-background hover:opacity-90', preview.kind !== 'ready' && 'pointer-events-none opacity-50')}
            >
              <Download size={15} aria-hidden /> Download
            </a>
            <a href={path} target="_blank" rel="noreferrer" aria-label={`Open the ${label} card`} className={cn(button, 'border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
              <ExternalLink size={15} aria-hidden /> Open
            </a>
          </div>
        </div>

        <div
          className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900"
          style={{ aspectRatio: `${width} / ${height}` }}
          aria-live="polite"
          aria-busy={preview.kind === 'loading'}
        >
          {preview.kind === 'ready' ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL the reader just drew
            <img src={preview.url} alt={`Your ${CARD_KIND_LABEL[kind].toLowerCase()} card for ${label}`} className="absolute inset-0 size-full object-contain" />
          ) : (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
              {preview.kind === 'loading' ? 'Drawing your card…' : preview.message}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default WrapCardMaker
