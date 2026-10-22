"use client"
import { FC, useEffect, useId, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import Modal from '../modals/Modal'
import { copyText } from './copyText'
import {
  BADGE_SIZE, DEFAULT_BADGE, LIST_CARD_SIZE, badgeSnippets, badgeUrl, listCardUrl, listSnippets, listWidgetUrl,
  type BadgeOptions, type EmbedTheme, type Snippet,
} from '@/lib/embedUrls'

type EmbedTarget =
  | { kind: "profile"; username: string }
  | { kind: "list"; id: string; title: string }

interface EmbedDialogProps {
  isOpen: boolean
  onClose: () => void
  target: EmbedTarget
  // False when we know the embed will show "not available" (the owner's own non-public profile or list).
  available?: boolean
}

interface Choice<T extends string> {
  value: T
  label: string
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Choice<T>[]; onChange: (v: T) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-xs font-medium text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-labelledby={id} className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-700 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-7 px-3 rounded text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === o.value ? "bg-foreground text-background" : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const THEMES: Choice<EmbedTheme>[] = [{ value: "auto", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]

// Copy-ready embed snippets (Markdown, HTML, BBCode) for a profile badge or a list, each with a live preview.
const EmbedDialog: FC<EmbedDialogProps> = ({ isOpen, onClose, target, available = true }) => {
  const [badge, setBadge] = useState<BadgeOptions>(DEFAULT_BADGE)
  const [theme, setTheme] = useState<EmbedTheme>("auto")
  const [active, setActive] = useState<string>(target.kind === "profile" ? "markdown" : "iframe")
  const [copied, setCopied] = useState<string | null>(null)
  // Snippets point at the canonical site; previews load from wherever this page is, so they work in dev too.
  const [origins, setOrigins] = useState({ site: process.env.NEXT_PUBLIC_SITE_URL || "", here: "" })
  useEffect(() => {
    setOrigins({ site: (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, ""), here: window.location.origin })
  }, [])

  if (!isOpen || !origins.here) return null

  const snippets: Snippet[] = target.kind === "profile"
    ? badgeSnippets(origins.site, target.username, badge)
    : listSnippets(origins.site, target.id, target.title, theme)
  const snippet = snippets.find((s) => s.key === active) ?? snippets[0]

  const copy = async (s: Snippet) => {
    try {
      await copyText(s.code)
      setCopied(s.key)
      setTimeout(() => setCopied((k) => (k === s.key ? null : k)), 2000)
    } catch {
      notify.error("Couldn't copy the snippet.", { description: "Select the code and copy it by hand." })
    }
  }

  let preview: JSX.Element
  if (target.kind === "profile") {
    const { width, height } = BADGE_SIZE[badge.layout]
    const format = snippet.key === "bbcode" ? "png" : "svg"
    // eslint-disable-next-line @next/next/no-img-element
    preview = <img key={`${badge.layout}${badge.theme}${badge.show}${format}`} src={badgeUrl(origins.here, target.username, badge, format)} alt="Badge preview" width={width} height={height} className="max-w-full h-auto" />
  } else if (snippet.key === "iframe") {
    preview = <iframe key={theme} src={listWidgetUrl(origins.here, target.id, theme)} title="List widget preview" className="w-full max-w-[560px] h-[380px] border-0 rounded-[14px]" />
  } else {
    const src = listCardUrl(origins.here, target.id, theme)
    // eslint-disable-next-line @next/next/no-img-element
    preview = <img key={`${theme}${snippet.key}`} src={snippet.key === "bbcode" ? src.replace("/card.svg", "/card.png") : src} alt="List card preview" width={LIST_CARD_SIZE.width} height={LIST_CARD_SIZE.height} className="max-w-full h-auto" />
  }

  const body = (
    <div className="flex flex-col gap-5 w-full px-6 pb-6">
      <p className="text-sm text-muted-foreground">
        {target.kind === "profile"
          ? "Show what you're reading on your GitHub profile, blog or forum signature. It updates as you read."
          : "Put this list on your blog or site. It stays in sync as the list changes."}
      </p>

      {!available && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {target.kind === "profile"
            ? "Your profile isn't public, so embeds show “not available” until you make it public in Settings."
            : "This list isn't public, so embeds show “not available” until you make it public."}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        {target.kind === "profile" && (
          <>
            <Segmented label="Show" value={badge.show} onChange={(show) => setBadge((b) => ({ ...b, show }))} options={[{ value: "reading", label: "Currently reading" }, { value: "finished", label: "Last finished" }]} />
            <Segmented label="Size" value={badge.layout} onChange={(layout) => setBadge((b) => ({ ...b, layout }))} options={[{ value: "full", label: "Full" }, { value: "compact", label: "Compact" }]} />
          </>
        )}
        <Segmented
          label="Theme"
          value={target.kind === "profile" ? badge.theme : theme}
          onChange={(t) => (target.kind === "profile" ? setBadge((b) => ({ ...b, theme: t })) : setTheme(t))}
          options={THEMES}
        />
      </div>

      <div role="tablist" aria-label="Snippet format" className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {snippets.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === snippet.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "-mb-px h-9 px-3 text-sm font-medium border-b-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s.key === snippet.key ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-3">
        {/* A checkered backdrop, so the preview's own edges and transparency show. */}
        <div className="grid place-items-center rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 bg-neutral-50 dark:bg-neutral-900/60 bg-[length:16px_16px] bg-[linear-gradient(45deg,rgba(0,0,0,.03)_25%,transparent_25%,transparent_75%,rgba(0,0,0,.03)_75%),linear-gradient(45deg,rgba(0,0,0,.03)_25%,transparent_25%,transparent_75%,rgba(0,0,0,.03)_75%)] [background-position:0_0,8px_8px]">
          {preview}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{snippet.hint}</span>
          <button
            type="button"
            onClick={() => copy(snippet)}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {copied === snippet.key ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied === snippet.key ? "Copied" : `Copy ${snippet.label}`}
          </button>
        </div>
        <textarea
          readOnly
          value={snippet.code}
          aria-label={`${snippet.label} snippet`}
          onFocus={(e) => e.currentTarget.select()}
          rows={3}
          className="w-full resize-none rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3 font-mono text-xs leading-relaxed break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          {target.kind === "profile"
            ? "Badges refresh about every 30 minutes. Every embed links back to your Bookmark profile."
            : "Embeds refresh about every 30 minutes and link back to the list on Bookmark."}
        </p>
      </div>
    </div>
  )

  return <Modal isOpen={isOpen} onClose={onClose} title={target.kind === "profile" ? "Embed your reading" : "Embed this list"} body={body} compact />
}

export default EmbedDialog
