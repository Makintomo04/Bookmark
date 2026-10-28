"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import { AtSign, Globe } from 'lucide-react'
import { FaInstagram, FaTiktok, FaXTwitter } from 'react-icons/fa6'
import { cn } from '@/lib/utils'
import type { AuthorAbout } from '@/lib/authors'
import type { AuthorLink, AuthorLinkKind } from '@/lib/authorLinks'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// Bluesky has no icon in our react-icons version, so it gets lucide's "@".
const LINK_ICONS: Record<AuthorLinkKind, FC<{ className?: string }>> = {
  website: Globe,
  instagram: FaInstagram,
  x: FaXTwitter,
  tiktok: FaTiktok,
  bluesky: AtSign,
}
const LINK_NAMES: Record<AuthorLinkKind, string> = {
  website: 'website',
  instagram: 'Instagram',
  x: 'X',
  tiktok: 'TikTok',
  bluesky: 'Bluesky',
}

// About the author, under the name on an author page: their photo, name, how many books the list below
// holds, a short bio and links to follow them elsewhere. A long bio opens with "Read more". Parts we don't
// have are left out.
const AboutAuthor: FC<{ name: string; about: AuthorAbout; bookCount: number | null }> = ({ name, about, bookCount }) => {
  const [open, setOpen] = useState(false)
  const { photoUrl, bio, links } = about
  const long = bio.length > 1 || (bio[0]?.length ?? 0) > 320
  // Nothing to say beyond the name already in the heading: leave the section out rather than show an empty box.
  if (!photoUrl && bio.length === 0 && !bookCount && links.length === 0) return null

  return (
    <section aria-labelledby="about-author-heading" className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800 sm:p-6">
      <h2 id="about-author-heading" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">About the author</h2>
      <div className="flex items-center gap-4">
        {photoUrl ? (
          <Image src={photoUrl} alt={`Photo of ${name}`} width={72} height={72} className="size-[72px] shrink-0 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900" />
        ) : (
          <span aria-hidden className="grid size-[72px] shrink-0 place-items-center rounded-full bg-neutral-100 text-xl font-semibold text-muted-foreground dark:bg-neutral-900">{initials(name)}</span>
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{name}</p>
          {!!bookCount && <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{bookCount.toLocaleString('en-GB')} {bookCount === 1 ? 'book' : 'books'}</p>}
        </div>
      </div>
      {bio.length > 0 && (
        <div className="mt-4 max-w-3xl">
          <div className={cn('flex flex-col gap-3 text-sm leading-relaxed', !open && long && 'line-clamp-4')}>
            {(open ? bio : bio.slice(0, 1)).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {long && (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
              {open ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}
      {links.length > 0 && (
        <ul aria-label={`${name} elsewhere`} className="mt-4 flex flex-wrap gap-2">
          {links.map((link) => <li key={link.kind}><AuthorLinkChip name={name} link={link} /></li>)}
        </ul>
      )}
    </section>
  )
}

const AuthorLinkChip: FC<{ name: string; link: AuthorLink }> = ({ name, link }) => {
  const Icon = LINK_ICONS[link.kind]
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link.kind === 'website' ? `${name}'s website, ${link.label}` : `${name} on ${LINK_NAMES[link.kind]}, ${link.label}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-muted-foreground hover:border-neutral-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-neutral-800 dark:hover:border-neutral-700"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{link.label}</span>
    </a>
  )
}

export default AboutAuthor
