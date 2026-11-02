"use client"
import { FC, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { achievementCounts, achievementCountsLine } from '@bookmark/shared/achievementCounts'
import { cn } from '@/lib/utils'
import { READER_TIERS, booksReadOf } from '@/lib/readerTier'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import type { AchievementItem } from '@/app/hooks/useAchievements'
import TierEmblem, { EMBLEM_ASPECT, type TierStep } from './TierEmblem'

const STEPS: TierStep[] = [
  { key: "new", label: "New reader", minBooks: 0, light: "#C9C9C9", colour: "#8A8A8A", shade: "#454545", shimmer: false },
  ...READER_TIERS,
]
const fmt = (n: number) => n.toLocaleString('en-GB')
const titleOf = (s: TierStep) => s.key === "new" ? s.label : `${s.label} reader`
const books = (n: number) => `${fmt(n)} more ${n === 1 ? "book" : "books"}`
const barMetal = (s: TierStep) => `linear-gradient(90deg, ${s.shade}, ${s.colour} 55%, ${s.light})`
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

// Sizes for a stage `w` wide. The emblems sit on a parabola through the stage's ends and its lowest point
// under the centre emblem, so one that's `dx` off centre rises by depth * (2dx / w)².
function geometry(w: number) {
  const narrow = w < 560
  const slot = narrow ? 108 : 176, emblem = narrow ? 116 : 160, depth = narrow ? 50 : 84
  const low = emblem * EMBLEM_ASPECT + 40
  return { w, slot, emblem, depth, low, top: low - depth, height: low + 30 }
}

// The reader's tier as a row of emblems on an arc, with theirs in the middle. Swipe, drag or use the arrow
// keys to look along it: tiers they've passed stay sharp but dimmed, ones ahead are blurred and greyed. Below,
// the focused tier's name and a books-read bar towards it, then the medal counts.
// When your tier has gone up since you last looked, the new emblem unblurs in place.
// Pass `reader` to show someone else's (their achievements page); otherwise it's the signed-in reader's.
const TierCarousel: FC<{ achievements: AchievementItem[]; reader?: { username: string; booksRead: number } }> = ({ achievements, reader }) => {
  const { user } = useUser()
  const booksReadFor = useBooksReadFor()
  const booksRead = reader ? reader.booksRead : user ? booksReadFor(user.username, booksReadOf(user)) : 0
  const current = STEPS.reduce((at, s, i) => booksRead >= s.minBooks ? i : at, 0)
  const own = !reader

  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const emblemRefs = useRef<(HTMLSpanElement | null)[]>([])
  const unlocking = useRef<(number | null)[]>(STEPS.map(() => null))
  // Where a key press or click is scrolling to, so a second press while it's moving counts from there.
  const target = useRef<number | null>(null)
  const [geo, setGeo] = useState<ReturnType<typeof geometry> | null>(null)
  const [focus, setFocus] = useState(current)
  const [justReached, setJustReached] = useState<string | null>(null)

  // Places every emblem for the track's scroll position. Runs per frame while scrolling, so it writes styles
  // directly rather than through React.
  const paint = useCallback(() => {
    const track = trackRef.current
    if (!track || !geo) return
    const centre = track.scrollLeft + track.clientWidth / 2
    STEPS.forEach((s, i) => {
      const el = emblemRefs.current[i]
      if (!el) return
      const dx = geo.slot * (i + .5) + (track.clientWidth - geo.slot) / 2 - centre
      const d = Math.abs(dx / geo.slot)
      const lift = geo.depth * Math.min(1, (2 * dx / geo.w) ** 2)
      const scale = d < 1 ? 1 - .52 * d : Math.max(.26, .48 - .13 * (d - 1))
      const locked = unlocking.current[i] ?? (booksRead < s.minBooks ? 1 : 0)
      const near = Math.max(0, 1 - d * 1.6)
      const bright = locked ? .62 - .08 * Math.min(d, 2) : .8 + .2 * (1 - Math.min(d, 1))
      const shadow = locked ? "" : " drop-shadow(0 6px 8px rgba(0,0,0,.35))" +
        (near ? ` drop-shadow(0 12px 30px ${s.colour}${Math.round(near * 90).toString(16).padStart(2, "0")})` : "")
      el.style.transform = `translateY(${-lift}px) scale(${scale})`
      el.style.filter = `blur(${(locked * (4 + d * 2.5)).toFixed(2)}px) grayscale(${locked}) brightness(${bright.toFixed(2)})${shadow}`
      el.style.opacity = String(Math.max(0, 1 - Math.max(0, d - 1.3) * .55) * (locked ? 1 - .2 * Math.min(d, 2) : 1 - .3 * Math.min(d, 1.5)))
      el.dataset.offCentre = String(d > .5)
      el.style.setProperty("--counter-scale", String(1 / scale))
    })
    if (target.current !== null && Math.abs(track.scrollLeft - target.current * geo.slot) < 1) target.current = null
    setFocus(Math.min(STEPS.length - 1, Math.max(0, Math.round(track.scrollLeft / geo.slot))))
  }, [geo, booksRead])

  const goTo = useCallback((i: number, instant = false) => {
    if (!geo) return
    target.current = Math.max(0, Math.min(STEPS.length - 1, i))
    trackRef.current?.scrollTo({ left: target.current * geo.slot, behavior: instant || reducedMotion() ? "auto" : "smooth" })
  }, [geo])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(([e]) => setGeo(geometry(e.contentRect.width)))
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // Centre the reader's own tier when the stage is laid out or their tier changes.
  useLayoutEffect(() => {
    if (!geo || !trackRef.current) return
    trackRef.current.scrollLeft = current * geo.slot
    paint()
  }, [geo, current]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { paint() }, [paint])

  // Your tier has gone up since this browser last showed it: hold the new emblem blurred, then reveal it.
  useEffect(() => {
    if (!own || !user || !geo) return
    const key = `tier-seen:${user.username}`
    let seen: number | null = null
    const remember = () => { try { localStorage.setItem(key, String(current)) } catch {} }
    try { const v = localStorage.getItem(key); seen = v === null ? null : Number(v) } catch {}
    if (seen === null || seen >= current) return remember()
    const held = unlocking.current
    held[current] = 1
    paint()
    let frame = 0
    // Only remembered once the reveal starts, so a remount before then (Strict Mode) still plays it.
    const delay = setTimeout(() => {
      remember()
      const start = performance.now(), length = reducedMotion() ? 1 : 1100
      emblemRefs.current[current]?.parentElement?.classList.add("tier-unlocking")
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / length)
        held[current] = p < 1 ? (1 - p) ** 3 : null
        paint()
        if (p < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
      setJustReached(`You've reached ${STEPS[current].label}`)
    }, reducedMotion() ? 0 : 600)
    const hide = setTimeout(() => setJustReached(null), 4200)
    return () => { clearTimeout(delay); clearTimeout(hide); cancelAnimationFrame(frame); held[current] = null }
  }, [own, user?.username, current, !!geo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse drag; touch swipes natively. Snapping is off while dragging, then we settle on the nearest tier.
  useEffect(() => {
    const track = trackRef.current
    if (!track || !geo) return
    let drag: { x: number; left: number; moved: boolean } | null = null
    let swallowClick = false
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0) drag = { x: e.clientX, left: track.scrollLeft, moved: false }
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; track.dataset.dragging = "true" }
      if (drag.moved) track.scrollLeft = drag.left - dx
    }
    const up = () => {
      if (drag?.moved) { swallowClick = true; delete track.dataset.dragging; goTo(Math.round(track.scrollLeft / geo.slot)) }
      drag = null
    }
    const click = (e: MouseEvent) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault() } }
    track.addEventListener("pointerdown", down)
    track.addEventListener("click", click, true)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      track.removeEventListener("pointerdown", down)
      track.removeEventListener("click", click, true)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [geo, goTo])

  if (!reader && !user) return null

  const shown = STEPS[focus]
  const next = STEPS[current + 1]
  let sub: string, count: string, fill: number, fillStep: TierStep
  if (focus < current) {
    sub = shown.minBooks ? `${own ? "You" : "They"} passed this at ${fmt(shown.minBooks)} books` : "Where every reader starts"
    count = "Reached"; fill = 1; fillStep = shown
  } else if (focus === current) {
    sub = next ? `${books(next.minBooks - booksRead)} to ${next.label}` : `${own ? "You've" : "They've"} reached the top tier`
    if (own && current === 0) sub += ". Your tier frames your avatar wherever your name appears."
    count = next ? `${fmt(booksRead)} / ${fmt(next.minBooks)}` : fmt(booksRead)
    fill = next ? booksRead / next.minBooks : 1; fillStep = next ?? shown
  } else {
    sub = `${books(shown.minBooks - booksRead)} to ${shown.label}`
    count = `${fmt(booksRead)} / ${fmt(shown.minBooks)}`; fill = booksRead / shown.minBooks; fillStep = shown
  }
  const locked = focus > current

  return (
    <section id="tier" aria-labelledby="tier-heading"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-neutral-200 pb-7 has-[[role=group]:focus-visible]:ring-2 has-[[role=group]:focus-visible]:ring-ring has-[[role=group]:focus-visible]:ring-offset-2 dark:border-neutral-800"
      style={{
        background: `radial-gradient(60% 70% at 50% 38%, color-mix(in srgb, ${shown.colour} 16%, transparent), transparent 70%)`,
        "--ink-light": shown.shade, "--ink-dark": shown.colour,
      } as CSSProperties}>
      <div ref={stageRef} className="relative" style={{ height: geo?.height ?? 290 }}>
        {geo && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 text-foreground" viewBox={`0 0 ${geo.w} ${geo.height}`} width={geo.w} height={geo.height}>
            <defs>
              <linearGradient id="tier-arc" gradientUnits="userSpaceOnUse" x1="0" x2={geo.w}>
                <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                <stop offset=".5" stopColor="currentColor" stopOpacity=".55" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="tier-spark"><stop offset="0" stopColor="currentColor" stopOpacity=".45" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
            </defs>
            <path d={`M0 ${geo.top} Q ${geo.w / 2} ${geo.top + 2 * geo.depth} ${geo.w} ${geo.top}`} fill="none" stroke="url(#tier-arc)" strokeWidth={1.2} />
            <g transform={`translate(${geo.w / 2} ${geo.low})`}>
              <circle r={14} fill="url(#tier-spark)" />
              <path d="M0 -13 C1 -3 3 -1 13 0 C3 1 1 3 0 13 C-1 3 -3 1 -13 0 C-3 -1 -1 -3 0 -13 Z" fill="currentColor" />
            </g>
          </svg>
        )}
        {/* The row's focus ring is drawn on the whole card (the section above): on the row itself, its faded
            ends would leave only a top and a bottom line. */}
        <div ref={trackRef} tabIndex={0} role="group" aria-roledescription="carousel" aria-label="Reader tiers"
          onScroll={() => requestAnimationFrame(paint)}
          onKeyDown={(e) => {
            const from = target.current ?? focus
            const to = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: STEPS.length - 1 }[e.key]
            if (to !== undefined) { e.preventDefault(); goTo(to) }
          }}
          className="relative flex h-full cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-none data-[dragging]:cursor-grabbing data-[dragging]:snap-none [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)]"
          style={{ paddingInline: geo ? `calc(50% - ${geo.slot / 2}px)` : undefined }}>
          {STEPS.map((s, i) => (
            <button key={s.key} type="button" tabIndex={-1} onClick={() => goTo(i)}
              aria-label={`${titleOf(s)}, ${s.minBooks ? `${fmt(s.minBooks)} books` : "where every reader starts"}, ${booksRead >= s.minBooks ? "reached" : "locked"}`}
              className="group relative h-full shrink-0 snap-center"
              style={{ width: geo?.slot ?? 176 }}>
              <span ref={(el) => { emblemRefs.current[i] = el }}
                className="absolute left-1/2 origin-bottom will-change-transform"
                style={geo ? { width: geo.emblem, marginLeft: -geo.emblem / 2, bottom: geo.height - geo.low + 20 } : { opacity: 0 }}>
                {i === current && (
                  <span aria-hidden className="absolute bottom-full left-1/2 mb-1 flex origin-bottom flex-col items-center [transform:translateX(-50%)_scale(var(--counter-scale,1))] text-xs font-semibold leading-none text-muted-foreground opacity-0 transition-opacity [[data-off-centre=true]>&]:opacity-100">
                    {own && "You"}
                    <span className="mt-1 border-x-[6px] border-t-[6px] border-x-transparent border-t-current" />
                  </span>
                )}
                <TierEmblem step={s} rank={i} />
                <span aria-hidden className="tier-unlock-ring pointer-events-none absolute left-1/2 top-[42%] -m-5 size-10 rounded-full border-2 opacity-0" style={{ borderColor: s.light }} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 px-4 text-center">
        <span aria-hidden={!justReached}
          className={cn("rounded-full border border-current px-2.5 py-0.5 text-xs font-semibold text-[color:var(--ink-light)] opacity-0 transition-opacity dark:text-[color:var(--ink-dark)]", justReached && "opacity-100")}>
          {justReached ?? " "}
        </span>
        <h2 id="tier-heading" className={cn("text-balance font-display text-3xl font-semibold italic leading-tight text-[color:var(--ink-light)] transition-opacity sm:text-[2.75rem] dark:text-[color:var(--ink-dark)]", locked && "opacity-40")}>
          {titleOf(shown)}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground tabular-nums">{sub}</p>
        <div className="mt-3 w-full max-w-md">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-muted-foreground tabular-nums">
            <span>Books read</span><span>{count}</span>
          </div>
          <div role="progressbar" aria-label={`Books read towards ${fillStep.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill * 100)}
            className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${fill > 0 ? Math.max(fill * 100, 2) : 0}%`, background: barMetal(fillStep) }} />
          </div>
        </div>
        <a href="#medals-heading" className="mt-3 rounded-md px-1 text-sm font-semibold tabular-nums hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {achievementCountsLine(achievementCounts(achievements))} <span aria-hidden>›</span>
        </a>
      </div>
      <p className="sr-only" aria-live="polite">{`${titleOf(shown)}. ${locked ? "Locked. " : ""}${sub}`}</p>
    </section>
  )
}

export default TierCarousel
